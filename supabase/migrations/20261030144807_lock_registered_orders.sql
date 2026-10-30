begin;
create or replace function public.set_production_registered(p_id uuid,p_expected_revision integer,p_registered boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare production public.productions%rowtype; before_data jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not coalesce(public.current_user_role() in ('warehouse','admin'),false) then raise exception 'Warehouse access required'; end if;
 select * into production from public.productions where id=p_id for update;
 if not found or production.status<>'active' then raise exception 'Order unavailable'; end if;
 if production.revision is distinct from p_expected_revision then raise exception 'Order revision changed' using errcode='40001'; end if;
 if p_registered is distinct from true then raise exception 'Registration cannot be removed'; end if;
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
