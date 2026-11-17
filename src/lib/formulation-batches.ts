import type { Role } from './access.ts';
import type { Recipe, RecipeDraft, RecipeUnit } from './recipes.ts';

export const batchKey='picui-preview-batches-v1';
export type ApprovedRecipe={id:string;version:number;document:RecipeDraft};
export type IngredientChoice={ingredient_id:string;choice:number|null};
export type BatchIngredient={
 ingredient_id:string;name:string;choice:number|null;included:boolean;optional:boolean;unit:RecipeUnit;
 base_quantity:number;expected_quantity:number;tolerance_lower:number|null;tolerance_upper:number|null;
 lower_limit:number|null;upper_limit:number|null;
};
export type StartBatch={request_id:string;recipe_id:string;recipe_version:number;date:string;responsible:string;factor:number;selections:IngredientChoice[]};
export type FormulationBatch={
 id:string;user_id:string;request_id:string;recipe_id:string;recipe_version:number;date:string;responsible:string;
 factor:number;status:'in_progress';created_at:string;recipe_snapshot:RecipeDraft;ingredients:BatchIngredient[];
};
export function approvedRecipes(recipes:Recipe[]):ApprovedRecipe[]{
 return recipes.filter(recipe=>recipe.active && recipe.current_version!==null).flatMap(recipe=>{
  const version=recipe.versions.find(version=>version.version===recipe.current_version && version.status==='current');
  return version ? [{id:recipe.id,version:version.version,document:version.document}] : [];
 });
}
export function validateBatchDetails(input:Pick<StartBatch,'date'|'responsible'|'factor'>){
 const parsed=new Date(input.date);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||input.date.startsWith('0000')||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==input.date)throw new Error('Ingresá una fecha de producción válida.');
 if(!input.responsible.trim()||input.responsible.trim().length>120)throw new Error('Ingresá un responsable de hasta 120 caracteres.');
 if(!Number.isFinite(input.factor)||input.factor<=0||input.factor>1000||Math.abs(input.factor*1000-Math.round(input.factor*1000))>0.0001)throw new Error('Ingresá entre 0,001 y 1000 amasadas, con hasta 3 decimales.');
}
// Integer arithmetic retains the six decimal places produced by two 3-decimal inputs.
export function scaledQuantity(base:number,factor:number):number{
 const product=BigInt(Math.round(base*1000))*BigInt(Math.round(factor*1000));
 if(product>1000000000000000n)throw new Error('La cantidad calculada supera el máximo permitido. Reducí las amasadas.');
 return Number(product)/1000000;
}
export function batchPlan(document:RecipeDraft,factor:number,selections:IngredientChoice[]):BatchIngredient[]{
 if(!Number.isFinite(factor)||factor<=0||factor>1000||Math.abs(factor*1000-Math.round(factor*1000))>0.0001)throw new Error('Ingresá entre 0,001 y 1000 amasadas, con hasta 3 decimales.');
 if(selections.length!==document.ingredients.length||new Set(selections.map(s=>s.ingredient_id)).size!==selections.length)throw new Error('Revisá la selección de todos los ingredientes.');
 const ingredients=document.ingredients.map(ingredient=>{
  const selection=selections.find(selection=>selection.ingredient_id===ingredient.id);
  if(!selection || (selection.choice===null && !ingredient.optional))throw new Error('Elegí una alternativa para cada ingrediente obligatorio.');
  if(selection.choice!==null && (!Number.isInteger(selection.choice)||selection.choice<0||selection.choice>ingredient.alternatives.length))throw new Error('Elegí una alternativa válida para cada ingrediente.');
  const expected=selection.choice===null ? 0 : scaledQuantity(ingredient.quantity,factor);
  return {ingredient_id:ingredient.id,name:selection.choice===null?ingredient.name:[ingredient.name,...ingredient.alternatives][selection.choice],choice:selection.choice,included:selection.choice!==null,optional:ingredient.optional,unit:ingredient.unit,base_quantity:ingredient.quantity,expected_quantity:expected,tolerance_lower:ingredient.tolerance_lower,tolerance_upper:ingredient.tolerance_upper,lower_limit:selection.choice===null||ingredient.tolerance_lower===null?null:expected*(100-ingredient.tolerance_lower)/100,upper_limit:selection.choice===null||ingredient.tolerance_upper===null?null:expected*(100+ingredient.tolerance_upper)/100};
 });
 if(!ingredients.some(ingredient=>ingredient.included))throw new Error('Incluí al menos un ingrediente para iniciar la elaboración.');
 return ingredients;
}
export function startPreviewBatch(batches:FormulationBatch[],recipes:Recipe[],role:Role|null,actorId:string,input:StartBatch):{batches:FormulationBatch[];id:string}{
 if(role!=='bakery' && role!=='admin')throw new Error('Solo panadería y administración pueden iniciar elaboraciones.');
 const previous=batches.find(batch=>batch.user_id===actorId && batch.request_id===input.request_id);
 if(previous)return {batches,id:previous.id};
 validateBatchDetails(input);
 const recipe=approvedRecipes(recipes).find(recipe=>recipe.id===input.recipe_id && recipe.version===input.recipe_version);
 if(!recipe)throw new Error('La receta cambió o dejó de estar vigente. Actualizá y seleccioná la receta nuevamente.');
 const ingredients=batchPlan(recipe.document,input.factor,input.selections);
 const batch:FormulationBatch={request_id:input.request_id,recipe_id:input.recipe_id,recipe_version:input.recipe_version,date:input.date,factor:input.factor,responsible:input.responsible.trim(),id:crypto.randomUUID(),user_id:actorId,status:'in_progress',created_at:new Date().toISOString(),recipe_snapshot:structuredClone(recipe.document),ingredients:structuredClone(ingredients)};
 return {batches:[batch,...batches],id:batch.id};
}
export function visibleBatches(batches:FormulationBatch[],role:Role|null,actorId:string):FormulationBatch[]{
 return role==='admin'?batches:role==='bakery'?batches.filter(batch=>batch.user_id===actorId):[];
}
