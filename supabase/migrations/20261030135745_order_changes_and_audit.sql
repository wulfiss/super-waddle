begin;

alter table public.productions
 add column status text not null default 'active' check (status in ('active','cancelled')),
 add column revision integer not null default 1 check (revision > 0);

create table public.production_audit (
 id uuid primary key default gen_random_uuid(),
 production_id uuid not null references public.productions(id),
 action text not null check (action in ('created','edited','cancelled')),
 actor_id uuid not null references auth.users(id),
 actor_name text not null,
 actor_role text not null check (actor_role in ('bakery','admin')),
 occurred_at timestamptz not null default clock_timestamp(),
 before_snapshot jsonb,
 after_snapshot jsonb not null,
 check ((action = 'created' and before_snapshot is null) or (action <> 'created' and before_snapshot is not null))
);
alter table public.production_audit enable row level security;
revoke all on public.production_audit from public, anon, authenticated;
grant select on public.production_audit to authenticated;
create policy production_audit_admin on public.production_audit for select to authenticated
 using ((select public.current_user_role()) = 'admin');
create index production_audit_occurred_at on public.production_audit(occurred_at desc);
create index production_audit_production_id on public.production_audit(production_id);
create index production_audit_actor_id on public.production_audit(actor_id);

drop policy productions_by_role on public.productions;
create policy productions_by_role on public.productions for select to authenticated
 using (status = 'active' and (
  (select public.current_user_role()) in ('warehouse','admin')
  or ((select public.current_user_role()) = 'bakery' and (select auth.uid()) = user_id)
 ));
-- production_items_by_role follows the parent policy and also hides cancelled items.

-- Only the guarded public RPCs may call these internal helpers.
create schema if not exists private;
create function private.production_snapshot(p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object(
  'id',p.id,'user_id',p.user_id,'date',p.date,'responsible',p.responsible,
  'status',p.status,'revision',p.revision,
  'items',coalesce((select jsonb_agg(jsonb_build_object(
   'product_id',i.product_id,'name',i.name,'unit',i.unit,'quantity',i.quantity
  ) order by i.name,i.product_id) from public.production_items i where i.production_id=p.id),'[]'::jsonb)
 ) from public.productions p where p.id=p_id
$$;

create function private.replace_production_items(p_id uuid,p_items jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare item jsonb; product public.products%rowtype;
begin
 if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Products required'; end if;
 if jsonb_array_length(p_items)=0 then raise exception 'Products required'; end if;
 delete from public.production_items where production_id=p_id;
 for item in select * from jsonb_array_elements(p_items) loop
  select * into strict product from public.products where id=(item->>'product_id')::uuid;
  if item->>'quantity' is null then raise exception 'Quantity required'; end if;
  insert into public.production_items(production_id,product_id,name,unit,quantity)
  values(p_id,product.id,product.name,product.unit,(item->>'quantity')::numeric);
 end loop;
end;
$$;

create function private.record_production_audit(p_id uuid,p_action text,p_before jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into public.production_audit(production_id,action,actor_id,actor_name,actor_role,before_snapshot,after_snapshot)
 values(p_id,p_action,auth.uid(),
  (select coalesce(u.email,u.id::text) from auth.users u where u.id=auth.uid()),
  public.current_user_role(),p_before,private.production_snapshot(p_id));
end;
$$;
revoke all on function private.production_snapshot(uuid) from public,anon,authenticated;
revoke all on function private.replace_production_items(uuid,jsonb) from public,anon,authenticated;
revoke all on function private.record_production_audit(uuid,text,jsonb) from public,anon,authenticated;

create or replace function public.save_production(p_date date,p_responsible text,p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare production_uuid uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not coalesce(public.current_user_role() in ('bakery','admin'),false) then raise exception 'Bakery access required'; end if;
 if p_date is null or p_responsible is null or length(trim(p_responsible)) not between 1 and 120 then raise exception 'Invalid production'; end if;
 insert into public.productions(user_id,date,responsible) values(auth.uid(),p_date,trim(p_responsible)) returning id into production_uuid;
 perform private.replace_production_items(production_uuid,p_items);
 perform private.record_production_audit(production_uuid,'created',null);
 return production_uuid;
end;
$$;

create function public.edit_production(p_id uuid,p_expected_revision integer,p_date date,p_responsible text,p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare production public.productions%rowtype; actor_role text; before_data jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 actor_role:=public.current_user_role();
 if not coalesce(actor_role in ('bakery','admin'),false) then raise exception 'Bakery access required'; end if;
 select * into production from public.productions where id=p_id for update;
 if not found or production.status<>'active' or (actor_role<>'admin' and production.user_id<>auth.uid()) then raise exception 'Order unavailable'; end if;
 if production.revision is distinct from p_expected_revision then raise exception 'Order revision changed' using errcode='40001'; end if;
 if p_date is null or p_responsible is null or length(trim(p_responsible)) not between 1 and 120 then raise exception 'Invalid production'; end if;
 before_data:=private.production_snapshot(p_id);
 update public.productions set date=p_date,responsible=trim(p_responsible),revision=revision+1 where id=p_id;
 perform private.replace_production_items(p_id,p_items);
 perform private.record_production_audit(p_id,'edited',before_data);
 return p_id;
end;
$$;

create function public.cancel_production(p_id uuid,p_expected_revision integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare production public.productions%rowtype; actor_role text; before_data jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 actor_role:=public.current_user_role();
 if not coalesce(actor_role in ('bakery','admin'),false) then raise exception 'Bakery access required'; end if;
 select * into production from public.productions where id=p_id for update;
 if not found or production.status<>'active' or (actor_role<>'admin' and production.user_id<>auth.uid()) then raise exception 'Order unavailable'; end if;
 if production.revision is distinct from p_expected_revision then raise exception 'Order revision changed' using errcode='40001'; end if;
 before_data:=private.production_snapshot(p_id);
 update public.productions set status='cancelled',revision=revision+1 where id=p_id;
 perform private.record_production_audit(p_id,'cancelled',before_data);
 return p_id;
end;
$$;

revoke all on function public.save_production(date,text,jsonb) from public,anon,authenticated;
revoke all on function public.edit_production(uuid,integer,date,text,jsonb) from public,anon,authenticated;
revoke all on function public.cancel_production(uuid,integer) from public,anon,authenticated;
grant execute on function public.save_production(date,text,jsonb) to authenticated;
grant execute on function public.edit_production(uuid,integer,date,text,jsonb) to authenticated;
grant execute on function public.cancel_production(uuid,integer) to authenticated;

commit;
