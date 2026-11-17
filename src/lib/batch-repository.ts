import {supabase} from './supabase.ts';
import type {Role} from './access.ts';
import {recipeKey,initialRecipes,type RecipeStore} from './recipes.ts';
import {batchKey,startPreviewBatch,visibleBatches,type FormulationBatch,type StartBatch} from './formulation-batches.ts';

function previewBatches():FormulationBatch[]{return JSON.parse(localStorage.getItem(batchKey)??'[]');}
export async function loadBatches(role:Role|null,actorId:string):Promise<FormulationBatch[]>{
 if(!supabase)return visibleBatches(previewBatches(),role,actorId);
 const {data,error}=await supabase.from('formulation_batches').select('*').order('created_at',{ascending:false});
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
