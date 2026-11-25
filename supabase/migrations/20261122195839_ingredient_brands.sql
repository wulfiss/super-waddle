begin;

-- Keep the ingredient as the unit of tolerance, incorporation and audit.
-- Older weighings retain their original single lot and expiry.
alter table public.formulation_weighings add column brands jsonb;
create function private.valid_brand_portions(parts jsonb, actual numeric, lot text, expiry date)
returns boolean language plpgsql immutable set search_path='' as $$
declare part jsonb; quantity numeric; total numeric:=0; multiple boolean; day text;
begin
 if parts is null then return true; end if;
 if jsonb_typeof(parts)<>'array' or jsonb_array_length(parts)=0 then return false; end if;
 multiple:=jsonb_array_length(parts)>1;
 for part in select value from jsonb_array_elements(parts) loop
  if jsonb_typeof(part->'name') is distinct from 'string' or length(trim(part->>'name')) not between 1 and 160
     or jsonb_typeof(part->'actual_quantity') is distinct from 'number' then return false; end if;
  quantity:=(part->>'actual_quantity')::numeric;
  if quantity not between 0.000001 and 1000000000 or quantity<>round(quantity,6) then return false; end if;
  total:=total+quantity;
  if part->>'lot' is not null and (jsonb_typeof(part->'lot')<>'string' or length(trim(part->>'lot')) not between 1 and 120) then return false; end if;
  day:=part->>'expiry_date';
  if day is not null and (day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or day::date not between date '0001-01-01' and date '9999-12-31') then return false; end if;
  if multiple and (part->>'lot' is null or day is null) then return false; end if;
 end loop;
 if multiple then return total=actual and lot is null and expiry is null; end if;
 return total=actual and (part->>'lot') is not distinct from lot and (day::date) is not distinct from expiry;
end;
$$;
alter table public.formulation_weighings add constraint formulation_brand_totals
 check (private.valid_brand_portions(brands,actual_quantity,lot,expiry_date));

create function public.record_formulation_weight(
 p_request_id uuid,p_batch_id uuid,p_ingredient_id text,p_expected_revision integer,p_action text,
 p_actual_quantity numeric,p_lot text,p_expiry_date date,p_note text,p_brands jsonb
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
  if p_brands is not null or p_actual_quantity is not null or p_lot is not null or p_expiry_date is not null then raise exception 'Save changes before incorporation'; end if;
  update public.formulation_weighings set incorporated=true,incorporated_by=actor,incorporated_at=clock_timestamp(),revision=revision+1
   where id=weight.id returning * into weight;
  action_name:='incorporated';
 else
  if existing and weight.brands is not null and p_brands is null then
   raise exception 'Include brand details when editing this weight';
  end if;
  if p_actual_quantity is null or p_actual_quantity not between 0.000001 and 1000000000 or p_actual_quantity<>round(p_actual_quantity,6) then raise exception 'Invalid actual quantity'; end if;
  if length(coalesce(trim(p_lot),''))>120 or (p_expiry_date is not null and p_expiry_date not between date '0001-01-01' and date '9999-12-31') then raise exception 'Invalid ingredient traceability'; end if;
  if existing then
   update public.formulation_weighings set actual_quantity=p_actual_quantity,brands=p_brands,lot=nullif(trim(p_lot),''),expiry_date=p_expiry_date,
    recorded_by=actor,recorded_at=clock_timestamp(),revision=revision+1 where id=weight.id returning * into weight;
  else
   insert into public.formulation_weighings(batch_id,ingredient_id,unit,expected_quantity,actual_quantity,lower_limit,upper_limit,lot,expiry_date,recorded_by,brands)
   values(p_batch_id,p_ingredient_id,ingredient->>'unit',(ingredient->>'expected_quantity')::numeric,p_actual_quantity,
    (ingredient->>'lower_limit')::numeric,(ingredient->>'upper_limit')::numeric,nullif(trim(p_lot),''),p_expiry_date,actor,p_brands) returning * into weight;
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
revoke all on function public.record_formulation_weight(uuid,uuid,text,integer,text,numeric,text,date,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_formulation_weight(uuid,uuid,text,integer,text,numeric,text,date,text,jsonb) to authenticated;


-- Preserve the original RPC for older clients and ordinary single-brand entry.
create or replace function public.record_formulation_weight(
 p_request_id uuid,p_batch_id uuid,p_ingredient_id text,p_expected_revision integer,p_action text,
 p_actual_quantity numeric,p_lot text,p_expiry_date date,p_note text
) returns jsonb language sql security invoker set search_path='' as $$
 select public.record_formulation_weight(p_request_id,p_batch_id,p_ingredient_id,p_expected_revision,
  p_action,p_actual_quantity,p_lot,p_expiry_date,p_note,null::jsonb);
$$;

-- This separate entry point also prevents older backends from silently dropping brand details.
create function public.save_formulation_batch_weights(
 p_request_id uuid,p_recipe_id uuid,p_recipe_version integer,p_date date,p_responsible text,p_factor numeric,p_selections jsonb,p_weights jsonb,p_confirm boolean
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare batch_id uuid;plan jsonb;line jsonb;entry jsonb;result jsonb;save_id uuid;confirm_id uuid;
begin
 batch_id:=public.start_formulation_batch(p_request_id,p_recipe_id,p_recipe_version,p_date,p_responsible,p_factor,p_selections);
 select ingredients into strict plan from public.formulation_batches where id=batch_id;
 if p_weights is null or jsonb_typeof(p_weights)<>'array' then raise exception 'Actual weights required'; end if;
 if p_confirm is null or (p_confirm and jsonb_array_length(p_weights)<>(select count(*) from jsonb_array_elements(plan) i where (i->>'included')::boolean))
 or (select count(distinct value->>'ingredient_id') from jsonb_array_elements(p_weights))<>jsonb_array_length(p_weights) then raise exception 'Invalid actual weights'; end if;
 if exists(select 1 from jsonb_array_elements(p_weights) e where not exists(
  select 1 from jsonb_array_elements(plan) i where (i->>'included')::boolean and i->>'ingredient_id'=e->>'ingredient_id'
 )) then raise exception 'Invalid ingredient'; end if;
 for line in select value from jsonb_array_elements(plan) where (value->>'included')::boolean loop
  select value into entry from jsonb_array_elements(p_weights) where value->>'ingredient_id'=line->>'ingredient_id';
  if not found and not p_confirm then continue; end if;
  if not found or jsonb_typeof(entry->'actual_quantity') is distinct from 'number'
   or (entry->>'lot' is not null and jsonb_typeof(entry->'lot')<>'string')
   or (entry->>'expiry_date' is not null and jsonb_typeof(entry->'expiry_date')<>'string') then raise exception 'Invalid actual weight'; end if;
  save_id:=md5('quick-save:'||p_request_id::text||':'||(line->>'ingredient_id'))::uuid;
  confirm_id:=md5('quick-confirm:'||p_request_id::text||':'||(line->>'ingredient_id'))::uuid;
  result:=public.record_formulation_weight(save_id,batch_id,line->>'ingredient_id',0,'save',(entry->>'actual_quantity')::numeric,entry->>'lot',(entry->>'expiry_date')::date,null,entry->'brands');
  if p_confirm then
   result:=public.record_formulation_weight(confirm_id,batch_id,line->>'ingredient_id',1,'incorporate',null,null,null,null);
  end if;
 end loop;
 if result is null then raise exception 'Actual weights required'; end if;
 return result;
end;
$$;
revoke all on function public.save_formulation_batch_weights(uuid,uuid,integer,date,text,numeric,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_formulation_batch_weights(uuid,uuid,integer,date,text,numeric,jsonb,jsonb,boolean) to authenticated;
commit;
