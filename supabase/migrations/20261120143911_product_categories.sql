begin;

alter table public.products
 add column category text not null default 'materia_prima'
 constraint products_category_check check (category in ('materia_prima','insumos'));

-- The existing bakery catalog consists of ingredients and this disposable supply.
update public.products set category='insumos' where name='MANGA DESCARTABLE x100u';

create function public.manage_product(
 p_id uuid,
 p_expected_revision integer,
 p_code text,
 p_name text,
 p_unit text,
 p_remove boolean,
 p_category text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 product public.products%rowtype;
 product_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if public.current_user_role() is distinct from 'admin' then raise exception 'Admin access required'; end if;
 if p_remove is null then raise exception 'Action required'; end if;
 if p_id is not null then
  select * into product from public.products where id=p_id for update;
  if not found or not product.active then raise exception 'Product unavailable'; end if;
  if product.revision is distinct from p_expected_revision then raise exception 'Product revision changed' using errcode='40001'; end if;
 end if;
 if p_remove then
  if p_id is null then raise exception 'Product required'; end if;
  update public.products set active=false,revision=revision+1 where id=p_id;
  return p_id;
 end if;
 if p_code is null or length(trim(p_code)) not between 1 and 80
    or p_name is null or length(trim(p_name)) not between 1 and 160
    or p_unit is null or length(trim(p_unit)) not between 1 and 40 then
  raise exception 'Invalid product';
 end if;
 if p_id is null then
  insert into public.products(code,name,unit,category)
  values(trim(p_code),trim(p_name),trim(p_unit),coalesce(p_category,'materia_prima'))
  returning id into product_id;
  return product_id;
 end if;
 update public.products
 set code=trim(p_code),name=trim(p_name),unit=trim(p_unit),
     category=coalesce(p_category,product.category),revision=revision+1
 where id=p_id;
 return p_id;
end;
$$;
revoke all on function public.manage_product(uuid,integer,text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.manage_product(uuid,integer,text,text,text,boolean,text) to authenticated;

-- Keep already-open versions of the app working during rollout.
create or replace function public.manage_product(
 p_id uuid,
 p_expected_revision integer,
 p_code text,
 p_name text,
 p_unit text,
 p_remove boolean
)
returns uuid language sql security invoker set search_path='' as $$
 select public.manage_product(p_id,p_expected_revision,p_code,p_name,p_unit,p_remove,null::text);
$$;

commit;
