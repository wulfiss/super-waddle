begin;
alter table public.products add column active boolean not null default true,
 add column revision integer not null default 1 check (revision>0);
create unique index products_code_normalized on public.products(lower(trim(code))) where code is not null;
create unique index products_name_normalized on public.products(lower(trim(name)));

create function public.manage_product(p_id uuid,p_expected_revision integer,p_code text,p_name text,p_unit text,p_remove boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare product public.products%rowtype; product_id uuid;
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
 if p_code is null or length(trim(p_code)) not between 1 and 80 or p_name is null or length(trim(p_name)) not between 1 and 160 or p_unit is null or length(trim(p_unit)) not between 1 and 40 then raise exception 'Invalid product'; end if;
 if p_id is null then
  insert into public.products(code,name,unit) values(trim(p_code),trim(p_name),trim(p_unit)) returning id into product_id;
  return product_id;
 end if;
 update public.products set code=trim(p_code),name=trim(p_name),unit=trim(p_unit),revision=revision+1 where id=p_id;
 return p_id;
end;
$$;
revoke all on function public.manage_product(uuid,integer,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.manage_product(uuid,integer,text,text,text,boolean) to authenticated;

-- Existing order lines retain the catalog snapshot originally ordered. A removed
-- product may remain in an existing order, but cannot be added to another order.
create or replace function private.replace_production_items(p_id uuid,p_items jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb; product public.products%rowtype; previous_items jsonb; previous_item jsonb;
begin
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Products required'; end if;
 if jsonb_array_length(p_items)=0 then raise exception 'Products required'; end if;
 select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) into previous_items from public.production_items i where production_id=p_id;
 delete from public.production_items where production_id=p_id;
 for item in select * from jsonb_array_elements(p_items) loop
  select * into strict product from public.products where id=(item->>'product_id')::uuid for share;
  select value into previous_item from jsonb_array_elements(previous_items) where value->>'product_id'=item->>'product_id';
  if not product.active and previous_item is null then raise exception 'Product unavailable'; end if;
  if item->>'quantity' is null then raise exception 'Quantity required'; end if;
  insert into public.production_items(production_id,product_id,code,name,unit,quantity)
  values(p_id,product.id,
   case when previous_item is null then product.code else previous_item->>'code' end,
   case when previous_item is null then product.name else previous_item->>'name' end,
   case when previous_item is null then product.unit else previous_item->>'unit' end,
   (item->>'quantity')::numeric);
 end loop;
end;
$$;
revoke all on function private.replace_production_items(uuid,jsonb) from public,anon,authenticated;
commit;
