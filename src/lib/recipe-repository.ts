import { supabase } from './supabase.ts';
import { changeRecipes, initialRecipes, recipeKey, type Recipe, type RecipeChange, type RecipeStore } from './recipes.ts';
import type { Role } from './access.ts';

export function readPreviewRecipes():RecipeStore {
 const stored=localStorage.getItem(recipeKey);
 if(stored)return JSON.parse(stored);
 const seed=initialRecipes();
 if(!__PICUI_HOSTED_DEMO__)return seed;
 const recipe=seed.recipes[0];
 const approved=changeRecipes(seed,'admin','preview-admin',{
  action:'approve',id:recipe.id,revision:recipe.revision,request_id:'sample-recipe-approval'
 });
 localStorage.setItem(recipeKey,JSON.stringify(approved));
 return approved;
}
export async function loadRecipes():Promise<Recipe[]> {
 if(!supabase)return readPreviewRecipes().recipes;
 const {data,error}=await supabase.from('formulation_recipes')
  .select('*, versions:formulation_recipe_versions!formulation_recipe_versions_recipe_id_fkey(*)').order('name');
 if(error)throw error;
 return (data ?? []) as Recipe[];
}
export async function persistRecipe(change:RecipeChange,role:Role|null,actorId:string):Promise<void> {
 if(role!=='admin')throw new Error('Solo administración puede modificar recetas.');
 if(supabase){
  const {error}=await supabase.rpc('manage_formulation_recipe',{
   p_request_id:change.request_id,p_action:change.action,p_id:change.id ?? null,
   p_expected_revision:change.revision ?? null,p_document:change.action==='save'?change.draft:null
  });
  if(error){
   if(error.code==='23505')throw new Error('Ya existe una receta con ese código.');
   if(error.code==='40001')throw new Error('La receta cambió. Actualizá la lista y volvé a abrirla.');
   throw new Error('No se pudo guardar la receta. Revisá la conexión y reintentá; no se duplicará la operación.');
  }
 }else{
  const commit=()=>{localStorage.setItem(recipeKey,JSON.stringify(changeRecipes(readPreviewRecipes(),role,actorId,change)));};
  if(navigator.locks)await navigator.locks.request(recipeKey,commit);else commit();
 }
}
