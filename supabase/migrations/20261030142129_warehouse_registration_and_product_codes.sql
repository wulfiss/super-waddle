begin;
alter table public.products add column code text unique check (code is null or length(trim(code))>0);
alter table public.production_items add column code text;
alter table public.productions add column registered_revision integer;
alter table public.production_audit drop constraint production_audit_action_check;
alter table public.production_audit add check (action in ('created','edited','cancelled','registered','unregistered'));
alter table public.production_audit drop constraint production_audit_actor_role_check;
alter table public.production_audit add check (actor_role in ('bakery','warehouse','admin'));
create or replace function private.production_snapshot(p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object(
  'id',p.id,'user_id',p.user_id,'date',p.date,'responsible',p.responsible,
  'status',p.status,'revision',p.revision,'registered_revision',p.registered_revision,
  'items',coalesce((select jsonb_agg(jsonb_build_object(
   'product_id',i.product_id,'code',i.code,'name',i.name,'unit',i.unit,'quantity',i.quantity
  ) order by i.name,i.product_id) from public.production_items i where i.production_id=p.id),'[]'::jsonb)
 ) from public.productions p where p.id=p_id
$$;

create or replace function private.replace_production_items(p_id uuid,p_items jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare item jsonb; product public.products%rowtype;
begin
 if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Products required'; end if;
 if jsonb_array_length(p_items)=0 then raise exception 'Products required'; end if;
 delete from public.production_items where production_id=p_id;
 for item in select * from jsonb_array_elements(p_items) loop
  select * into strict product from public.products where id=(item->>'product_id')::uuid;
  if item->>'quantity' is null then raise exception 'Quantity required'; end if;
  insert into public.production_items(production_id,product_id,code,name,unit,quantity)
  values(p_id,product.id,product.code,product.name,product.unit,(item->>'quantity')::numeric);
 end loop;
end;
$$;


create function public.set_production_registered(p_id uuid,p_expected_revision integer,p_registered boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare production public.productions%rowtype; before_data jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not coalesce(public.current_user_role() in ('warehouse','admin'),false) then raise exception 'Warehouse access required'; end if;
 select * into production from public.productions where id=p_id for update;
 if not found or production.status<>'active' then raise exception 'Order unavailable'; end if;
 if production.revision is distinct from p_expected_revision then raise exception 'Order revision changed' using errcode='40001'; end if;
 if p_registered is null then raise exception 'Registration value required'; end if;
 if coalesce(production.registered_revision=production.revision,false) is not distinct from p_registered then return p_id; end if;
 before_data:=private.production_snapshot(p_id);
 update public.productions set registered_revision=case when p_registered then revision else null end where id=p_id;
 perform private.record_production_audit(p_id,case when p_registered then 'registered' else 'unregistered' end,before_data);
 return p_id;
end;
$$;
revoke all on function public.set_production_registered(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.set_production_registered(uuid,integer,boolean) to authenticated;
commit;
