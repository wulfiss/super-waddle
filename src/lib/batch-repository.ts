import type {BrandPortion} from './ingredient-brands.ts';
import {supabase} from './supabase.ts';
import type {Role} from './access.ts';
import {recipeKey,initialRecipes,type RecipeStore} from './recipes.ts';
import {batchKey,startPreviewBatch,visibleBatches,type FormulationBatch,type StartBatch} from './formulation-batches.ts';

function previewBatches():FormulationBatch[]{return JSON.parse(localStorage.getItem(batchKey)??'[]');}
export async function loadBatches(role:Role|null,actorId:string):Promise<FormulationBatch[]>{
 if(!supabase)return visibleBatches(previewBatches(),role,actorId);
 const {data,error}=await supabase.from('formulation_batches').select('*, weighings:formulation_weighings(*), events:formulation_batch_events(*)').order('created_at',{ascending:false});
 if(error)throw error;
 return (data??[]) as FormulationBatch[];
}
export async function persistBatch(input:StartBatch,role:Role|null,actorId:string):Promise<string>{
 if(role!=='bakery' && role!=='admin')throw new Error('Solo panadería y administración pueden iniciar elaboraciones.');
 if(supabase){
  const {data,error}=await supabase.rpc('start_formulation_batch',{
   p_request_id:input.request_id,p_recipe_id:input.recipe_id,p_recipe_version:input.recipe_version,
   p_date:input.date,p_responsible:input.responsible,p_factor:input.factor,p_selections:input.selections
  });
  if(error){
   if(error.code==='40001')throw new Error('La receta cambió o dejó de estar vigente. Actualizá y seleccioná la receta nuevamente.');
   throw new Error('No se pudo confirmar el guardado. Revisá la conexión y reintentá sin cambiar los datos; no se duplicará la elaboración.');
  }
  if(typeof data!=='string')throw new Error('No pudimos confirmar el identificador de elaboración. Reintentá sin cambiar los datos.');
  return data;
 }
 const commit=()=>{
  const recipes:RecipeStore=JSON.parse(localStorage.getItem(recipeKey)??JSON.stringify(initialRecipes()));
  const result=startPreviewBatch(previewBatches(),recipes.recipes,role,actorId,input);
  localStorage.setItem(batchKey,JSON.stringify(result.batches));return result.id;
 };
 // Recipe edits and starts use the same lock, so a newly approved version cannot race a start.
 return navigator.locks ? navigator.locks.request(recipeKey,()=>navigator.locks.request(batchKey,commit)) : commit();
}

export async function persistWeight(input:import('./formulation-weighing.ts').WeightChange,role:Role|null,actorId:string):Promise<FormulationBatch>{
 if(role!=='bakery'&&role!=='admin')throw new Error('No tenés permisos para registrar pesajes.');
 if(supabase){
  const {data,error}=await supabase.rpc('record_formulation_weight',{
   p_request_id:input.request_id,p_batch_id:input.batch_id,p_ingredient_id:input.ingredient_id,p_expected_revision:input.expected_revision,
   ...(input.action!=='incorporate'&&input.brands?{p_brands:input.brands}:{}),
   p_action:input.action,p_actual_quantity:input.action==='incorporate'?null:input.actual_quantity,
   p_lot:input.action==='incorporate'?null:input.lot,p_expiry_date:input.action==='incorporate'?null:input.expiry_date,p_note:input.note??null
  });
  if(error){
   if(error.code==='40001')throw new Error('El peso cambió. Actualizá la elaboración antes de continuar. Tus datos no se sobrescribieron.');
   if(error.code==='42501')throw new Error('No tenés permisos para modificar este registro.');
   if(error.code==='55000')throw new Error('El ingrediente ya está confirmado. Actualizá la elaboración; administración puede corregir el registro con historial.');
   throw new Error('No se pudo confirmar el guardado. Reintentá sin cambiar los datos; no se duplicará el registro.');
  }
  if(!data||typeof data!=='object'||data.id!==input.batch_id||!Array.isArray(data.weighings))throw new Error('No se pudo confirmar el resultado. Reintentá sin cambiar los datos.');
  return data as FormulationBatch;
 }
 const {changePreviewWeight}=await import('./formulation-weighing.ts');
 const {findPreviewAccount}=await import('./preview-accounts.ts');
 const commit=()=>{
  const batches=previewBatches(),batch=batches.find(batch=>batch.id===input.batch_id);
  if(!batch)throw new Error('La elaboración no está disponible.');
  const updated=changePreviewWeight(batch,role,actorId,input,findPreviewAccount(actorId)?.name??actorId);
  localStorage.setItem(batchKey,JSON.stringify(batches.map(batch=>batch.id===updated.id?updated:batch)));return updated;
 };
 return navigator.locks?navigator.locks.request(batchKey,commit):commit();
}

export type QuickWeight={ingredient_id:string;brands?:BrandPortion[];actual_quantity:number;lot:string|null;expiry_date:string|null};
export async function completeBatch(input:StartBatch,weights:QuickWeight[],role:Role|null,actorId:string,confirm=true):Promise<FormulationBatch>{
 if(role!=='bakery'&&role!=='admin')throw new Error('No tenés permisos para registrar elaboraciones.');
 if(supabase){
  const branded=weights.some(row=>row.brands);
  const {data,error}=await supabase.rpc(branded?'save_formulation_batch_weights':'complete_formulation_batch',{
   ...(branded?{p_confirm:confirm}:{}),
   p_request_id:input.request_id,p_recipe_id:input.recipe_id,p_recipe_version:input.recipe_version,p_date:input.date,
   p_responsible:input.responsible,p_factor:input.factor,p_selections:input.selections,p_weights:weights
  });
  if(error){if(error.code==='PGRST202'&&branded)throw new Error('La base de datos todavía no admite marcas por ingrediente. Los datos siguen en el formulario.');if(error.code==='40001')throw new Error('La receta cambió. Actualizá y revisá las cantidades antes de guardar.');throw new Error('No se pudo confirmar el guardado. Reintentá sin cambiar los datos; no se duplicará la elaboración.');}
  if(!data||(confirm&&data.status!=='closed')||!Array.isArray(data.weighings))throw new Error('No se pudo confirmar el resultado. Reintentá sin cambiar los datos.');
  return data as FormulationBatch;
 }
 const {changePreviewWeight}=await import('./formulation-weighing.ts');
 const {findPreviewAccount}=await import('./preview-accounts.ts');
 const commit=()=>{
  const recipes:RecipeStore=JSON.parse(localStorage.getItem(recipeKey)??JSON.stringify(initialRecipes()));
  const started=startPreviewBatch(previewBatches(),recipes.recipes,role,actorId,input);
  let batch=started.batches.find(row=>row.id===started.id)!;
  const lines=batch.ingredients.filter(line=>line.included);
  if((confirm&&weights.length!==lines.length)||new Set(weights.map(w=>w.ingredient_id)).size!==weights.length)throw new Error('Completá todos los pesos reales.');
  for(const line of lines){
   const weight=weights.find(weight=>weight.ingredient_id===line.ingredient_id);if(!weight&&!confirm)continue;
   if(!weight)throw new Error('Completá todos los pesos reales.');
   batch=changePreviewWeight(batch,role,actorId,{...weight,batch_id:batch.id,action:'save',expected_revision:0,request_id:input.request_id+':save:'+line.ingredient_id},findPreviewAccount(actorId)?.name??actorId);
   if(confirm)batch=changePreviewWeight(batch,role,actorId,{batch_id:batch.id,ingredient_id:line.ingredient_id,action:'incorporate',expected_revision:1,request_id:input.request_id+':confirm:'+line.ingredient_id},findPreviewAccount(actorId)?.name??actorId);
  }
  localStorage.setItem(batchKey,JSON.stringify(started.batches.map(row=>row.id===batch.id?batch:row)));return batch;
 };
 return navigator.locks?navigator.locks.request(recipeKey,()=>navigator.locks.request(batchKey,commit)):commit();
}
