begin;
create table public.formulation_batches (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id), request_id uuid not null,
 recipe_id uuid not null, recipe_version integer not null,
 date date not null, responsible text not null check(length(trim(responsible)) between 1 and 120),
 factor numeric not null check(factor between 0.001 and 1000 and factor=round(factor,3)),
 status text not null default 'in_progress' check(status='in_progress'),
 created_at timestamptz not null default clock_timestamp(),
 recipe_snapshot jsonb not null check(jsonb_typeof(recipe_snapshot)='object'),
 ingredients jsonb not null check(jsonb_typeof(ingredients)='array' and jsonb_array_length(ingredients) between 1 and 100),
 foreign key(recipe_id,recipe_version) references public.formulation_recipe_versions(recipe_id,version),
 unique(user_id,request_id)
);
create index formulation_batches_user_created on public.formulation_batches(user_id,created_at desc);
create index formulation_batches_recipe on public.formulation_batches(recipe_id,recipe_version);
create index formulation_batches_created on public.formulation_batches(created_at desc);
create table public.formulation_batch_events (
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references public.formulation_batches(id),
 actor_id uuid not null references auth.users(id),action text not null check(action='started'),
 occurred_at timestamptz not null default clock_timestamp(),after_snapshot jsonb not null
);
create index formulation_batch_events_batch on public.formulation_batch_events(batch_id,occurred_at);
create index formulation_batch_events_actor on public.formulation_batch_events(actor_id);
alter table public.formulation_batches enable row level security;
alter table public.formulation_batch_events enable row level security;
revoke all on public.formulation_batches,public.formulation_batch_events from public,anon,authenticated;
grant select on public.formulation_batches,public.formulation_batch_events to authenticated;
create policy formulation_batches_read on public.formulation_batches for select to authenticated using (
 (select public.current_user_role())='admin' or
 ((select public.current_user_role())='bakery' and user_id=(select auth.uid()))
);
create policy formulation_batch_events_read on public.formulation_batch_events for select to authenticated using (
 (select public.current_user_role())='admin' or
 ((select public.current_user_role())='bakery' and exists(
  select 1 from public.formulation_batches b where b.id=batch_id and b.user_id=(select auth.uid())
 ))
);

-- Computes all expected quantities on the server from the approved, locked recipe.
-- The client supplies only batch metadata and one choice per ingredient, never expected amounts.
create function public.start_formulation_batch(
 p_request_id uuid,p_recipe_id uuid,p_recipe_version integer,p_date date,p_responsible text,p_factor numeric,p_selections jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); recipe public.formulation_recipes%rowtype; document jsonb;
 ingredient jsonb; selection jsonb; choice integer; selected_name text; expected numeric;
 lower_value numeric; upper_value numeric; ingredients jsonb:='[]'; included_count integer:=0;
 batch public.formulation_batches%rowtype;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if not coalesce(public.current_user_role() in ('bakery','admin'),false) then raise exception 'Bakery access required'; end if;
 if p_request_id is null then raise exception 'Operation identifier required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||p_request_id::text,0));
 select * into batch from public.formulation_batches where user_id=actor and request_id=p_request_id;
 if found then return batch.id; end if;
 if p_date is null or p_date not between date '0001-01-01' and date '9999-12-31'
 or p_responsible is null or length(trim(p_responsible)) not between 1 and 120 then raise exception 'Invalid batch details'; end if;
 if p_factor is null or p_factor not between 0.001 and 1000 or p_factor<>round(p_factor,3) then raise exception 'Invalid batch factor'; end if;
 select * into recipe from public.formulation_recipes where id=p_recipe_id for share;
 if not found or not recipe.active or recipe.current_version is null or recipe.current_version is distinct from p_recipe_version then
  raise exception 'Recipe version changed or unavailable' using errcode='40001';
 end if;
 select v.document into document from public.formulation_recipe_versions v
 where v.recipe_id=recipe.id and v.version=recipe.current_version and v.status='current';
 if not found then raise exception 'Recipe version changed or unavailable' using errcode='40001'; end if;
 if p_selections is null or jsonb_typeof(p_selections)<>'array' then raise exception 'Ingredient choices required'; end if;
 if jsonb_array_length(p_selections)<>jsonb_array_length(document->'ingredients') or
 (select count(distinct value->>'ingredient_id') from jsonb_array_elements(p_selections))<>jsonb_array_length(p_selections) then raise exception 'Invalid ingredient choices'; end if;
 for ingredient in select * from jsonb_array_elements(document->'ingredients') loop
  select value into selection from jsonb_array_elements(p_selections) where value->>'ingredient_id'=ingredient->>'id';
  if not found or jsonb_typeof(selection)<>'object' or not (selection ? 'choice') then raise exception 'Ingredient choice required'; end if;
  choice:=null;expected:=0;selected_name:=ingredient->>'name';lower_value:=null;upper_value:=null;
  if selection->'choice'='null'::jsonb then
   if not (ingredient->>'optional')::boolean then raise exception 'Required ingredient cannot be skipped'; end if;
  else
   if jsonb_typeof(selection->'choice')<>'number' then raise exception 'Invalid ingredient choice'; end if;
   if (selection->>'choice')::numeric<>trunc((selection->>'choice')::numeric) or
    (selection->>'choice')::numeric not between 0 and jsonb_array_length(ingredient->'alternatives') then raise exception 'Invalid ingredient choice'; end if;
   choice:=(selection->>'choice')::integer;
   selected_name:=case when choice=0 then ingredient->>'name' else ingredient->'alternatives'->>(choice-1) end;
   expected:=(ingredient->>'quantity')::numeric*p_factor;
   if expected>1000000000 then raise exception 'Expected quantity too large'; end if;
   if ingredient->>'tolerance_lower' is not null then lower_value:=expected*(100-(ingredient->>'tolerance_lower')::numeric)/100; end if;
   if ingredient->>'tolerance_upper' is not null then upper_value:=expected*(100+(ingredient->>'tolerance_upper')::numeric)/100; end if;
   included_count:=included_count+1;
  end if;
  ingredients:=ingredients||jsonb_build_array(jsonb_build_object(
   'ingredient_id',ingredient->>'id','name',selected_name,'choice',choice,'included',choice is not null,
   'optional',(ingredient->>'optional')::boolean,'unit',ingredient->>'unit',
   'base_quantity',(ingredient->>'quantity')::numeric,'expected_quantity',expected,
   'tolerance_lower',ingredient->'tolerance_lower','tolerance_upper',ingredient->'tolerance_upper',
   'lower_limit',lower_value,'upper_limit',upper_value
  ));
 end loop;
 if included_count=0 then raise exception 'At least one ingredient required'; end if;
 insert into public.formulation_batches(user_id,request_id,recipe_id,recipe_version,date,responsible,factor,recipe_snapshot,ingredients)
 values(actor,p_request_id,recipe.id,recipe.current_version,p_date,trim(p_responsible),p_factor,document,ingredients) returning * into batch;
 insert into public.formulation_batch_events(batch_id,actor_id,action,after_snapshot) values(batch.id,actor,'started',to_jsonb(batch));
 return batch.id;
end;
$$;
revoke all on function public.start_formulation_batch(uuid,uuid,integer,date,text,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.start_formulation_batch(uuid,uuid,integer,date,text,numeric,jsonb) to authenticated;
commit;
