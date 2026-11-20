begin;
-- One transaction: create the batch, save all actual weights and confirm incorporation.
-- INVOKER deliberately reuses the existing authenticated, owner-checked RPCs.
create function public.complete_formulation_batch(
 p_request_id uuid,p_recipe_id uuid,p_recipe_version integer,p_date date,p_responsible text,p_factor numeric,p_selections jsonb,p_weights jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare batch_id uuid;plan jsonb;line jsonb;entry jsonb;result jsonb;save_id uuid;confirm_id uuid;
begin
 batch_id:=public.start_formulation_batch(p_request_id,p_recipe_id,p_recipe_version,p_date,p_responsible,p_factor,p_selections);
 select ingredients into strict plan from public.formulation_batches where id=batch_id;
 if p_weights is null or jsonb_typeof(p_weights)<>'array' then raise exception 'Actual weights required'; end if;
 if jsonb_array_length(p_weights)<>(select count(*) from jsonb_array_elements(plan) i where (i->>'included')::boolean)
 or (select count(distinct value->>'ingredient_id') from jsonb_array_elements(p_weights))<>jsonb_array_length(p_weights) then raise exception 'Invalid actual weights'; end if;
 for line in select value from jsonb_array_elements(plan) where (value->>'included')::boolean loop
  select value into entry from jsonb_array_elements(p_weights) where value->>'ingredient_id'=line->>'ingredient_id';
  if not found or jsonb_typeof(entry->'actual_quantity') is distinct from 'number'
   or (entry->>'lot' is not null and jsonb_typeof(entry->'lot')<>'string')
   or (entry->>'expiry_date' is not null and jsonb_typeof(entry->'expiry_date')<>'string') then raise exception 'Invalid actual weight'; end if;
  save_id:=md5('quick-save:'||p_request_id::text||':'||(line->>'ingredient_id'))::uuid;
  confirm_id:=md5('quick-confirm:'||p_request_id::text||':'||(line->>'ingredient_id'))::uuid;
  result:=public.record_formulation_weight(save_id,batch_id,line->>'ingredient_id',0,'save',(entry->>'actual_quantity')::numeric,entry->>'lot',(entry->>'expiry_date')::date,null);
  result:=public.record_formulation_weight(confirm_id,batch_id,line->>'ingredient_id',1,'incorporate',null,null,null,null);
 end loop;
 return result;
end;
$$;
revoke all on function public.complete_formulation_batch(uuid,uuid,integer,date,text,numeric,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_formulation_batch(uuid,uuid,integer,date,text,numeric,jsonb,jsonb) to authenticated;
commit;
