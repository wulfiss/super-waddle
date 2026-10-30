-- Initial migration for a new Supabase project. Apply with `supabase db push`.
begin;
create table public.products (
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 unit text not null
);
create table public.productions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 date date not null,
 responsible text not null check (length(trim(responsible)) between 1 and 120),
 created_at timestamptz not null default now()
);
create table public.production_items (
 id uuid primary key default gen_random_uuid(),
 production_id uuid not null references public.productions(id) on delete cascade,
 product_id uuid not null references public.products(id),
 name text not null,
 unit text not null,
 quantity numeric not null check (quantity > 0 and quantity < 'Infinity'::numeric),
 unique(production_id, product_id)
);
alter table public.products enable row level security;
alter table public.productions enable row level security;
alter table public.production_items enable row level security;
create index productions_user_created_at on public.productions(user_id, created_at desc);
create policy products_read on public.products for select to authenticated using (true);
create policy productions_own on public.productions for select to authenticated using (auth.uid() = user_id);
create policy production_items_own on public.production_items for select to authenticated using (exists(select 1 from public.productions p where p.id = production_id and p.user_id = auth.uid()));
revoke all on public.products, public.productions, public.production_items from anon, authenticated;
grant select on public.products, public.productions, public.production_items to authenticated;
create function public.save_production(p_date date, p_responsible text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare production_uuid uuid; item jsonb; product public.products%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
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
