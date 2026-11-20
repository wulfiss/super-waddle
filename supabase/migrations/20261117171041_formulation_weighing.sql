begin;
alter table public.formulation_batches drop constraint formulation_batches_status_check;
alter table public.formulation_batches add constraint formulation_batches_status_check check(status in ('in_progress','closed'));
alter table public.formulation_batches
 add column closed_at timestamptz, add column closed_by uuid references auth.users(id),
 add column has_discrepancies boolean not null default false,
 add column had_incorporated_discrepancies boolean not null default false,
 add check((status='closed')=(closed_at is not null)), add check((closed_at is null)=(closed_by is null));
create index formulation_batches_closed_by on public.formulation_batches(closed_by);
alter table public.formulation_batch_events drop constraint formulation_batch_events_action_check;
alter table public.formulation_batch_events add constraint formulation_batch_events_action_check check(action in ('started','weight_saved','incorporated','weight_corrected','closed'));
alter table public.formulation_batch_events
 add column ingredient_id text, add column request_id uuid,
 add column actor_name text, add column note text check(length(note)<=500), add column before_snapshot jsonb;
update public.formulation_batch_events e set actor_name=coalesce(u.email,u.id::text) from auth.users u where u.id=e.actor_id;
create unique index formulation_batch_event_operation on public.formulation_batch_events(actor_id,request_id) where request_id is not null;

create table public.formulation_weighings (
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references public.formulation_batches(id),
 ingredient_id text not null, unit text not null,
 expected_quantity numeric not null check(expected_quantity>0),
 actual_quantity numeric not null check(actual_quantity between 0.000001 and 1000000000 and actual_quantity=round(actual_quantity,6)),
 lower_limit numeric,upper_limit numeric,lot text check(length(lot) between 1 and 120),
 expiry_date date check(expiry_date between date '0001-01-01' and date '9999-12-31'),
 revision integer not null default 1 check(revision>0),recorded_by uuid not null references auth.users(id),
 recorded_at timestamptz not null default clock_timestamp(),
 incorporated boolean not null default false,incorporated_by uuid references auth.users(id),incorporated_at timestamptz,
 difference_quantity numeric generated always as (actual_quantity-expected_quantity) stored,
 difference_percent numeric generated always as (case when expected_quantity=0 then null else (actual_quantity-expected_quantity)*100/expected_quantity end) stored,
 within_tolerance boolean generated always as (case when lower_limit is null or upper_limit is null then null else actual_quantity between lower_limit and upper_limit end) stored,
 unique(batch_id,ingredient_id),check((incorporated_at is null)=(incorporated_by is null)),check(incorporated=(incorporated_at is not null)),
 check((lower_limit is null)=(upper_limit is null)),check(lower_limit<=upper_limit)
);
create index formulation_weighings_recorder on public.formulation_weighings(recorded_by);
create index formulation_weighings_incorporator on public.formulation_weighings(incorporated_by);
alter table public.formulation_weighings enable row level security;
revoke all on public.formulation_weighings from public,anon,authenticated;
grant select on public.formulation_weighings to authenticated;
create policy formulation_weighings_read on public.formulation_weighings for select to authenticated using (
 (select public.current_user_role())='admin' or
 ((select public.current_user_role())='bakery' and exists(
  select 1 from public.formulation_batches b where b.id=batch_id and b.user_id=(select auth.uid())
 ))
);

-- Private projection, usable only from the guarded RPC. One snapshot avoids a read-after-save gap.
create function private.formulation_batch_detail(p_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(b)||jsonb_build_object(
  'weighings',coalesce((select jsonb_agg(w order by w.ingredient_id) from public.formulation_weighings w where w.batch_id=b.id),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(e order by e.occurred_at,e.id) from public.formulation_batch_events e where e.batch_id=b.id),'[]'::jsonb)
 ) from public.formulation_batches b where b.id=p_id
$$;
revoke all on function private.formulation_batch_detail(uuid) from public,anon,authenticated;

create function public.record_formulation_weight(
 p_request_id uuid,p_batch_id uuid,p_ingredient_id text,p_expected_revision integer,p_action text,
 p_actual_quantity numeric,p_lot text,p_expiry_date date,p_note text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid();actor_role text;actor_name text;
 batch public.formulation_batches%rowtype;weight public.formulation_weighings%rowtype;
 ingredient jsonb;before_data jsonb;existing boolean;previous_batch uuid;action_name text;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 actor_role:=public.current_user_role();
 if not coalesce(actor_role in ('bakery','admin'),false) then raise exception 'Bakery access required' using errcode='42501'; end if;
 if p_request_id is null or not coalesce(p_action in ('save','incorporate','correct'),false) then raise exception 'Invalid operation'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||p_request_id::text,0));
 select * into batch from public.formulation_batches where id=p_batch_id for update;
 if not found or (actor_role<>'admin' and batch.user_id<>actor) then raise exception 'Batch access denied' using errcode='42501'; end if;
 select batch_id into previous_batch from public.formulation_batch_events where actor_id=actor and request_id=p_request_id;
 if found then
  if previous_batch<>p_batch_id then raise exception 'Operation identifier already used'; end if;
  return private.formulation_batch_detail(p_batch_id);
 end if;
 select value into ingredient from jsonb_array_elements(batch.ingredients) where value->>'ingredient_id'=p_ingredient_id and (value->>'included')::boolean;
 if not found then raise exception 'Ingredient not included'; end if;
 select * into weight from public.formulation_weighings where batch_id=p_batch_id and ingredient_id=p_ingredient_id for update;
 existing:=found;
 if coalesce(weight.revision,0) is distinct from p_expected_revision then raise exception 'Weight revision changed' using errcode='40001'; end if;
 if p_action='correct' then
  if actor_role<>'admin' or not existing or not weight.incorporated then raise exception 'Admin correction required' using errcode='42501'; end if;
 elsif batch.status='closed' or coalesce(weight.incorporated,false) then raise exception 'Ingredient already incorporated or batch closed' using errcode='55000'; end if;
 if length(coalesce(trim(p_note),''))>500 then raise exception 'Note too long'; end if;
 if existing then before_data:=to_jsonb(weight); end if;
 if p_action='incorporate' then
  if not existing then raise exception 'Save weight before incorporation'; end if;
  if p_actual_quantity is not null or p_lot is not null or p_expiry_date is not null then raise exception 'Save changes before incorporation'; end if;
  update public.formulation_weighings set incorporated=true,incorporated_by=actor,incorporated_at=clock_timestamp(),revision=revision+1
   where id=weight.id returning * into weight;
  action_name:='incorporated';
 else
  if p_actual_quantity is null or p_actual_quantity not between 0.000001 and 1000000000 or p_actual_quantity<>round(p_actual_quantity,6) then raise exception 'Invalid actual quantity'; end if;
  if length(coalesce(trim(p_lot),''))>120 or (p_expiry_date is not null and p_expiry_date not between date '0001-01-01' and date '9999-12-31') then raise exception 'Invalid ingredient traceability'; end if;
  if existing then
   update public.formulation_weighings set actual_quantity=p_actual_quantity,lot=nullif(trim(p_lot),''),expiry_date=p_expiry_date,
    recorded_by=actor,recorded_at=clock_timestamp(),revision=revision+1 where id=weight.id returning * into weight;
  else
   insert into public.formulation_weighings(batch_id,ingredient_id,unit,expected_quantity,actual_quantity,lower_limit,upper_limit,lot,expiry_date,recorded_by)
   values(p_batch_id,p_ingredient_id,ingredient->>'unit',(ingredient->>'expected_quantity')::numeric,p_actual_quantity,
    (ingredient->>'lower_limit')::numeric,(ingredient->>'upper_limit')::numeric,nullif(trim(p_lot),''),p_expiry_date,actor) returning * into weight;
  end if;
  action_name:=case when p_action='correct' then 'weight_corrected' else 'weight_saved' end;
 end if;
 select coalesce(email,id::text) into actor_name from auth.users where id=actor;
 insert into public.formulation_batch_events(batch_id,ingredient_id,actor_id,actor_name,request_id,action,note,before_snapshot,after_snapshot)
 values(p_batch_id,p_ingredient_id,actor,actor_name,p_request_id,action_name,nullif(trim(p_note),''),before_data,to_jsonb(weight));
 update public.formulation_batches set
  has_discrepancies=exists(select 1 from public.formulation_weighings w where w.batch_id=p_batch_id and w.difference_quantity<>0),
  had_incorporated_discrepancies=had_incorporated_discrepancies or (weight.incorporated and weight.difference_quantity<>0)
 where id=p_batch_id returning * into batch;
 -- Discrepancies do not block closure: the agreed workflow requires completed incorporation, not prior authorization.
 if batch.status='in_progress' and not exists(
  select 1 from jsonb_array_elements(batch.ingredients) i
  left join public.formulation_weighings w on w.batch_id=p_batch_id and w.ingredient_id=i->>'ingredient_id'
  where (i->>'included')::boolean and (w.id is null or not w.incorporated)
 ) then
  update public.formulation_batches set status='closed',closed_at=clock_timestamp(),closed_by=actor where id=p_batch_id returning * into batch;
  insert into public.formulation_batch_events(batch_id,actor_id,actor_name,action,after_snapshot)
  values(p_batch_id,actor,actor_name,'closed',jsonb_build_object('batch',to_jsonb(batch),'weighings',(select jsonb_agg(w) from public.formulation_weighings w where w.batch_id=p_batch_id)));
 end if;
 return private.formulation_batch_detail(p_batch_id);
end;
$$;
revoke all on function public.record_formulation_weight(uuid,uuid,text,integer,text,numeric,text,date,text) from public,anon,authenticated;
grant execute on function public.record_formulation_weight(uuid,uuid,text,integer,text,numeric,text,date,text) to authenticated;

-- Capture the human-readable actor when starting new elaboraciones as well.
create or replace function public.start_formulation_batch(
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
 insert into public.formulation_batch_events(batch_id,actor_id,actor_name,action,after_snapshot) values(batch.id,actor,(select coalesce(email,id::text) from auth.users where id=actor),'started',to_jsonb(batch));
 return batch.id;
end;
$$;
commit;
