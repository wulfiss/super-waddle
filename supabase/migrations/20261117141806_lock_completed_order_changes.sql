begin;

-- Preserve row locks, ownership checks and existing RPC grants.
create or replace function public.edit_production(p_id uuid,p_expected_revision integer,p_date date,p_responsible text,p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare production public.productions%rowtype; actor_role text; before_data jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 actor_role:=public.current_user_role();
 if not coalesce(actor_role in ('bakery','admin'),false) then raise exception 'Bakery access required'; end if;
 select * into production from public.productions where id=p_id for update;
 if not found or production.status<>'active' or (actor_role<>'admin' and production.user_id<>auth.uid()) then raise exception 'Order unavailable'; end if;
 if production.revision is distinct from p_expected_revision then raise exception 'Order revision changed' using errcode='40001'; end if;
 if production.registered_revision=production.revision then raise exception 'Order already registered'; end if;
 if p_date is null or p_responsible is null or length(trim(p_responsible)) not between 1 and 120 then raise exception 'Invalid production'; end if;
 before_data:=private.production_snapshot(p_id);
 update public.productions set date=p_date,responsible=trim(p_responsible),revision=revision+1 where id=p_id;
 perform private.replace_production_items(p_id,p_items);
 perform private.record_production_audit(p_id,'edited',before_data);
 return p_id;
end;
$$;

create or replace function public.cancel_production(p_id uuid,p_expected_revision integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare production public.productions%rowtype; actor_role text; before_data jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 actor_role:=public.current_user_role();
 if not coalesce(actor_role in ('bakery','admin'),false) then raise exception 'Bakery access required'; end if;
 select * into production from public.productions where id=p_id for update;
 if not found or production.status<>'active' or (actor_role<>'admin' and production.user_id<>auth.uid()) then raise exception 'Order unavailable'; end if;
 if production.revision is distinct from p_expected_revision then raise exception 'Order revision changed' using errcode='40001'; end if;
 if production.registered_revision=production.revision then raise exception 'Order already registered'; end if;
 before_data:=private.production_snapshot(p_id);
 update public.productions set status='cancelled',revision=revision+1 where id=p_id;
 perform private.record_production_audit(p_id,'cancelled',before_data);
 return p_id;
end;
$$;

commit;
