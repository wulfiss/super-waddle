begin;
create table public.formulation_recipes (
 id uuid primary key default gen_random_uuid(), code text not null check(length(code) between 1 and 80),
 name text not null check(length(name) between 1 and 160), active boolean not null default true,
 revision integer not null default 1 check(revision>0), latest_version integer not null default 1 check(latest_version>0),
 current_version integer, created_at timestamptz not null default clock_timestamp()
);
create unique index formulation_recipe_code_unique on public.formulation_recipes(lower(code));
create table public.formulation_recipe_versions (
 recipe_id uuid not null references public.formulation_recipes(id), version integer not null check(version>0),
 status text not null check(status in ('draft','current','obsolete')), document jsonb not null check(jsonb_typeof(document)='object'),
 created_at timestamptz not null default clock_timestamp(), created_by uuid references auth.users(id),
 approved_at timestamptz, approved_by uuid references auth.users(id), primary key(recipe_id,version),
 check((approved_at is null)=(approved_by is null)), check(status<>'current' or approved_at is not null)
);
create unique index formulation_one_current on public.formulation_recipe_versions(recipe_id) where status='current';
create unique index formulation_one_draft on public.formulation_recipe_versions(recipe_id) where status='draft';
alter table public.formulation_recipes
 add foreign key(id,latest_version) references public.formulation_recipe_versions(recipe_id,version) deferrable initially deferred,
 add foreign key(id,current_version) references public.formulation_recipe_versions(recipe_id,version) deferrable initially deferred;
-- Operation records supply both idempotency and an audit of recipe changes.
create table public.formulation_recipe_events (
 id uuid primary key default gen_random_uuid(), recipe_id uuid not null references public.formulation_recipes(id),
 actor_id uuid not null references auth.users(id), request_id uuid not null, action text not null check(action in ('save','approve','archive')),
 occurred_at timestamptz not null default clock_timestamp(), before_snapshot jsonb, after_snapshot jsonb not null, unique(actor_id,request_id)
);
create index formulation_recipe_events_recipe on public.formulation_recipe_events(recipe_id,occurred_at);
create index formulation_recipe_events_actor on public.formulation_recipe_events(actor_id);
create index formulation_recipe_versions_actor on public.formulation_recipe_versions(created_by);
create index formulation_recipe_versions_approver on public.formulation_recipe_versions(approved_by);
alter table public.formulation_recipes enable row level security;
alter table public.formulation_recipe_versions enable row level security;
alter table public.formulation_recipe_events enable row level security;
revoke all on public.formulation_recipes,public.formulation_recipe_versions,public.formulation_recipe_events from public,anon,authenticated;
grant select on public.formulation_recipes,public.formulation_recipe_versions,public.formulation_recipe_events to authenticated;
create policy formulation_recipes_read on public.formulation_recipes for select to authenticated using (
 (select public.current_user_role())='admin' or ((select public.current_user_role())='bakery' and active and current_version is not null)
);
create policy formulation_versions_read on public.formulation_recipe_versions for select to authenticated using (
 (select public.current_user_role())='admin' or ((select public.current_user_role())='bakery' and status='current' and exists(select 1 from public.formulation_recipes r where r.id=recipe_id and r.active and r.current_version=version))
);
create policy formulation_events_read on public.formulation_recipe_events for select to authenticated using ((select public.current_user_role())='admin');

create function private.validate_formulation_document(p_document jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare line jsonb; alternative jsonb; key text; value numeric; names text[]; ids text[]:='{}';
begin
 if p_document is null or jsonb_typeof(p_document)<>'object' then raise exception 'Invalid recipe document'; end if;
 if jsonb_typeof(p_document->'code') is distinct from 'string' or length(trim(p_document->>'code')) not between 1 and 80
 or jsonb_typeof(p_document->'name') is distinct from 'string' or length(trim(p_document->>'name')) not between 1 and 160
 or jsonb_typeof(p_document->'family') is distinct from 'string' or length(p_document->>'family')>120
 or jsonb_typeof(p_document->'provisional') is distinct from 'boolean' then raise exception 'Invalid recipe details'; end if;
 if p_document->>'product_id' is not null and not exists(select 1 from public.products where id=(p_document->>'product_id')::uuid) then raise exception 'Product unavailable'; end if;
 if jsonb_typeof(p_document->'ingredients') is distinct from 'array' then raise exception 'Ingredients required'; end if;
 if jsonb_array_length(p_document->'ingredients') not between 1 and 100 then raise exception 'Invalid ingredient count'; end if;
 for line in select * from jsonb_array_elements(p_document->'ingredients') loop
  if jsonb_typeof(line)<>'object' or jsonb_typeof(line->'id') is distinct from 'string' or length(line->>'id') not between 1 and 80 or (line->>'id')=any(ids)
  or jsonb_typeof(line->'name') is distinct from 'string' or length(trim(line->>'name')) not between 1 and 160
  or jsonb_typeof(line->'optional') is distinct from 'boolean' or not coalesce(line->>'unit' in ('kg','g','L','unidades'),false)
  or jsonb_typeof(line->'quantity') is distinct from 'number' then raise exception 'Invalid ingredient'; end if;
  ids:=array_append(ids,line->>'id'); value:=(line->>'quantity')::numeric;
  if value<=0 or value>1000000000 or value<>round(value,3) then raise exception 'Invalid ingredient quantity'; end if;
  if jsonb_typeof(line->'alternatives') is distinct from 'array' then raise exception 'Invalid alternatives'; end if;
  if jsonb_array_length(line->'alternatives')>10 then raise exception 'Too many alternatives'; end if;
  names:=array[lower(trim(line->>'name'))];
  for alternative in select * from jsonb_array_elements(line->'alternatives') loop
   if jsonb_typeof(alternative)<>'string' or length(trim(alternative#>>'{}')) not between 1 and 160 or lower(trim(alternative#>>'{}'))=any(names) then raise exception 'Invalid or duplicate alternative'; end if;
   names:=array_append(names,lower(trim(alternative#>>'{}')));
  end loop;
  if ((line->>'tolerance_lower') is null)<>((line->>'tolerance_upper') is null) then raise exception 'Both tolerances required'; end if;
  foreach key in array array['tolerance_lower','tolerance_upper'] loop
   if line->>key is not null then
    if jsonb_typeof(line->key)<>'number' then raise exception 'Invalid tolerance'; end if;
    value:=(line->>key)::numeric;
    if value<0 or value>(case when key='tolerance_lower' then 100 else 1000 end) then raise exception 'Invalid tolerance'; end if;
   end if;
  end loop;
 end loop;
 return p_document || jsonb_build_object('code',trim(p_document->>'code'),'name',trim(p_document->>'name'),'family',trim(p_document->>'family'));
end;
$$;
revoke all on function private.validate_formulation_document(jsonb) from public,anon,authenticated;

-- Direct writes remain revoked. Only this authenticated, role-checked RPC can mutate recipes.
create function public.manage_formulation_recipe(p_request_id uuid,p_action text,p_id uuid,p_expected_revision integer,p_document jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare recipe public.formulation_recipes%rowtype; actor uuid:=auth.uid(); document jsonb; before_data jsonb; previous_id uuid; version_status text;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if not coalesce(public.current_user_role()='admin',false) then raise exception 'Administrator access required'; end if;
 if p_request_id is null or not coalesce(p_action in ('save','approve','archive'),false) then raise exception 'Invalid operation'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||p_request_id::text,0));
 select recipe_id into previous_id from public.formulation_recipe_events where actor_id=actor and request_id=p_request_id;
 if found then return previous_id; end if;
 if p_id is not null then
  select * into recipe from public.formulation_recipes where id=p_id for update;
  if not found or not recipe.active then raise exception 'Recipe unavailable'; end if;
  if recipe.revision is distinct from p_expected_revision then raise exception 'Recipe revision changed' using errcode='40001'; end if;
  select jsonb_build_object('recipe',to_jsonb(recipe),'versions',(select jsonb_agg(v order by version) from public.formulation_recipe_versions v where recipe_id=p_id)) into before_data;
 elsif p_action<>'save' then raise exception 'Recipe required'; end if;
 if p_action='save' then
  document:=private.validate_formulation_document(p_document);
  if p_id is null then
   insert into public.formulation_recipes(code,name) values(document->>'code',document->>'name') returning * into recipe;
  else
   update public.formulation_recipe_versions set status='obsolete' where recipe_id=p_id and status='draft';
   update public.formulation_recipes set code=document->>'code',name=document->>'name',latest_version=latest_version+1,revision=revision+1 where id=p_id returning * into recipe;
  end if;
  insert into public.formulation_recipe_versions(recipe_id,version,status,document,created_by) values(recipe.id,recipe.latest_version,'draft',document,actor);
 elsif p_action='approve' then
  select status into version_status from public.formulation_recipe_versions where recipe_id=p_id and version=recipe.latest_version;
  if version_status<>'draft' then raise exception 'Only draft recipes can be approved'; end if;
  update public.formulation_recipe_versions set status='obsolete' where recipe_id=p_id and status='current';
  update public.formulation_recipe_versions set status='current',approved_at=clock_timestamp(),approved_by=actor where recipe_id=p_id and version=recipe.latest_version;
  update public.formulation_recipes set current_version=latest_version,revision=revision+1 where id=p_id returning * into recipe;
 else
  update public.formulation_recipes set active=false,revision=revision+1 where id=p_id returning * into recipe;
 end if;
 insert into public.formulation_recipe_events(recipe_id,actor_id,request_id,action,before_snapshot,after_snapshot)
 select recipe.id,actor,p_request_id,p_action,before_data,jsonb_build_object('recipe',to_jsonb(recipe),'versions',(select jsonb_agg(v order by version) from public.formulation_recipe_versions v where recipe_id=recipe.id));
 return recipe.id;
end;
$$;
revoke all on function public.manage_formulation_recipe(uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.manage_formulation_recipe(uuid,text,uuid,integer,jsonb) to authenticated;
-- Reference only: provisional draft, never approved automatically.
with recipe as (
 insert into public.formulation_recipes(code,name) values ('PAN-MIGNON-PROV','Pan mignón') returning id
)
insert into public.formulation_recipe_versions(recipe_id,version,status,document)
select id,1,'draft',$recipe${"code":"PAN-MIGNON-PROV","name":"Pan mignón","family":"Panes","product_id":null,"provisional":true,"ingredients":[{"id":"harina","name":"Harina 000 Cañuelas","quantity":25,"unit":"kg","optional":false,"alternatives":["Harina 000 Lealtad"],"tolerance_lower":null,"tolerance_upper":null},{"id":"agua","name":"Agua","quantity":30,"unit":"L","optional":false,"alternatives":[],"tolerance_lower":null,"tolerance_upper":null},{"id":"sal","name":"Sal fina Dos Anclas","quantity":1,"unit":"kg","optional":false,"alternatives":[],"tolerance_lower":null,"tolerance_upper":null},{"id":"levadura","name":"Levadura virgen","quantity":250,"unit":"g","optional":false,"alternatives":[],"tolerance_lower":null,"tolerance_upper":null},{"id":"malta","name":"Extracto de malta","quantity":250,"unit":"g","optional":true,"alternatives":[],"tolerance_lower":null,"tolerance_upper":null},{"id":"mejorador","name":"Mejorador Fórmula 1","quantity":300,"unit":"g","optional":false,"alternatives":["Mejorador Rinde Más"],"tolerance_lower":null,"tolerance_upper":null}]}$recipe$::jsonb from recipe;
commit;
