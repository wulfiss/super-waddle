begin;

alter table public.productions add column kind text not null default 'regular' check (kind in ('regular','extra'));

create or replace function private.production_snapshot(p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object(
  'id',p.id,'user_id',p.user_id,'date',p.date,'responsible',p.responsible,
  'kind',p.kind,'status',p.status,'revision',p.revision,'registered_revision',p.registered_revision,
  'items',coalesce((select jsonb_agg(jsonb_build_object(
   'product_id',i.product_id,'code',i.code,'name',i.name,'unit',i.unit,'quantity',i.quantity
  ) order by i.name,i.product_id) from public.production_items i where i.production_id=p.id),'[]'::jsonb)
 ) from public.productions p where p.id=p_id
$$;

create or replace function public.save_extra_production(p_date date,p_responsible text,p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare production_uuid uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not coalesce(public.current_user_role() in ('bakery','admin'),false) then raise exception 'Bakery access required'; end if;
 if p_date is null or p_responsible is null or length(trim(p_responsible)) not between 1 and 120 then raise exception 'Invalid production'; end if;
 insert into public.productions(user_id,date,responsible,kind) values(auth.uid(),p_date,trim(p_responsible),'extra') returning id into production_uuid;
 perform private.replace_production_items(production_uuid,p_items);
 perform private.record_production_audit(production_uuid,'created',null);
 return production_uuid;
end;
$$;

revoke all on function private.production_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.save_extra_production(date,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_extra_production(date,text,jsonb) to authenticated;

commit;
