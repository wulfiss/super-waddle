begin;

-- Roles are provisioned by trusted database administrators, never by the client.
create table public.user_roles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check (role in ('bakery', 'warehouse', 'admin'))
);
alter table public.user_roles enable row level security;
revoke all on public.user_roles from public, anon, authenticated;
grant select on public.user_roles to authenticated;
create policy user_roles_own on public.user_roles for select to authenticated
 using ((select auth.uid()) = user_id);

-- Preserve current users' bakery workflow; new users need an explicit assignment.
insert into public.user_roles(user_id, role) select id, 'bakery' from auth.users;

-- Invoker security: the caller can only look up their own assigned role.
create function public.current_user_role()
returns text language sql stable security invoker set search_path = '' as $$
 select role from public.user_roles where user_id = (select auth.uid())
$$;
revoke all on function public.current_user_role() from public, anon, authenticated;
grant execute on function public.current_user_role() to authenticated;

drop policy products_read on public.products;
create policy products_read on public.products for select to authenticated
 using ((select public.current_user_role()) in ('bakery', 'warehouse', 'admin'));

drop policy productions_own on public.productions;
create policy productions_by_role on public.productions for select to authenticated
 using (
  (select public.current_user_role()) in ('warehouse', 'admin')
  or ((select public.current_user_role()) = 'bakery' and (select auth.uid()) = user_id)
 );

drop policy production_items_own on public.production_items;
-- The parent query obeys productions' RLS, including the staff/admin boundary.
create policy production_items_by_role on public.production_items for select to authenticated
 using (exists(select 1 from public.productions p where p.id = production_id));
create index productions_created_at on public.productions(created_at desc);

create or replace function public.save_production(p_date date, p_responsible text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare production_uuid uuid; item jsonb; product public.products%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not coalesce(public.current_user_role() in ('bakery', 'admin'), false) then
  raise exception 'Bakery access required';
 end if;
 if p_date is null or p_responsible is null or length(trim(p_responsible)) not between 1 and 120 then raise exception 'Invalid production'; end if;
 if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Products required'; end if;
 if jsonb_array_length(p_items) = 0 then raise exception 'Products required'; end if;
 insert into public.productions(user_id,date,responsible) values(auth.uid(),p_date,trim(p_responsible)) returning id into production_uuid;
 for item in select * from jsonb_array_elements(p_items) loop
  select * into strict product from public.products where id = (item->>'product_id')::uuid;
  if item->>'quantity' is null then raise exception 'Quantity required'; end if;
  insert into public.production_items(production_id,product_id,name,unit,quantity)
  values(production_uuid,product.id,product.name,product.unit,(item->>'quantity')::numeric);
 end loop;
 return production_uuid;
end;
$$;
revoke all on function public.save_production(date,text,jsonb) from public, anon, authenticated;
grant execute on function public.save_production(date,text,jsonb) to authenticated;

commit;
