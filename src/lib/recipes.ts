import type { Role } from './access.ts';

export const recipeKey = 'picui-preview-recipes-v1';
export type RecipeUnit = 'kg' | 'g' | 'L' | 'unidades';
export type RecipeIngredient = {
 id:string; name:string; quantity:number; unit:RecipeUnit; optional:boolean;
 alternatives:string[]; tolerance_lower:number|null; tolerance_upper:number|null;
};
export type RecipeDraft = {
 code:string; name:string; family:string; product_id:string|null; provisional:boolean;
 ingredients:RecipeIngredient[];
};
export type RecipeVersion = {
 recipe_id:string; version:number; status:'draft'|'current'|'obsolete'; document:RecipeDraft;
 created_at:string; created_by:string|null; approved_at:string|null; approved_by:string|null;
};
export type Recipe = {
 id:string; code:string; name:string; active:boolean; revision:number;
 latest_version:number; current_version:number|null; versions:RecipeVersion[];
};
export type RecipeChange =
 | {action:'save'; id?:string; revision?:number; draft:RecipeDraft; request_id:string}
 | {action:'approve'|'archive'; id:string; revision:number; request_id:string};
export type RecipeStore = {recipes:Recipe[]; operations:Record<string,string>};
export const recipeStatus = {draft:'Borrador',current:'Vigente',obsolete:'Obsoleta'};
export function latestRecipe(recipe:Recipe) {
 const version=recipe.versions.find(version=>version.version===recipe.latest_version);
 if(!version)throw new Error('No se encontró la versión de la receta.');
 return version;
}
export function decimalAmount(value:string):number {
 const text=value.trim();
 if(!/^\d+(?:[.,]\d{1,3})?$/.test(text))return NaN;
 return Number(text.replace(',','.'));
}
export function normalizeRecipe(input:RecipeDraft):RecipeDraft {
 const draft=structuredClone(input);
 draft.code=draft.code.trim();draft.name=draft.name.trim();draft.family=draft.family.trim();
 if(!draft.code || draft.code.length>80 || !draft.name || draft.name.length>160 || draft.family.length>120)throw new Error('Ingresá un código y un nombre válidos.');
 if(!Array.isArray(draft.ingredients) || draft.ingredients.length<1 || draft.ingredients.length>100)throw new Error('Agregá entre 1 y 100 ingredientes.');
 const ids=new Set<string>();
 for(const line of draft.ingredients){
  line.name=line.name.trim();line.alternatives=line.alternatives.map(name=>name.trim()).filter(Boolean);
  if(!line.id || ids.has(line.id) || !line.name || line.name.length>160 || !Number.isFinite(line.quantity) || line.quantity<=0 || line.quantity>1e9 || Math.abs(line.quantity*1000-Math.round(line.quantity*1000))>0.0001 || !['kg','g','L','unidades'].includes(line.unit))throw new Error('Revisá los ingredientes: nombre, cantidad positiva (hasta 3 decimales) y unidad.');
  ids.add(line.id);
  const names=[line.name,...line.alternatives].map(name=>name.toLocaleLowerCase('es-AR'));
  if(line.alternatives.length>10 || line.alternatives.some(name=>name.length>160) || new Set(names).size!==names.length)throw new Error('Las alternativas deben ser distintas y tener un nombre válido.');
  for(const [value,max] of [[line.tolerance_lower,100],[line.tolerance_upper,1000]] as const){
   if(value!==null && (!Number.isFinite(value) || value<0 || value>max))throw new Error('Revisá las tolerancias porcentuales.');
  }
  if((line.tolerance_lower===null)!==(line.tolerance_upper===null))throw new Error('Completá ambas tolerancias o dejá las dos vacías.');
 }
 return draft;
}
export function changeRecipes(store:RecipeStore,role:Role|null,actorId:string,change:RecipeChange):RecipeStore {
 if(role!=='admin')throw new Error('Solo administración puede modificar recetas.');
 const operation=actorId+':'+change.request_id;
 if(store.operations[operation])return store;
 const before=change.id ? store.recipes.find(recipe=>recipe.id===change.id && recipe.active) : undefined;
 if(change.id && (!before || before.revision!==change.revision))throw new Error('La receta cambió. Actualizá la lista y volvé a abrirla.');
 const recipes=structuredClone(store.recipes);
 let recipe=before ? recipes.find(recipe=>recipe.id===before.id)! : undefined;
 const now=new Date().toISOString();
 if(change.action==='save'){
  const draft=normalizeRecipe(change.draft);
  if(recipes.some(other=>other.id!==recipe?.id && other.code.toLowerCase()===draft.code.toLowerCase()))throw new Error('Ya existe una receta con ese código.');
  if(!recipe){recipe={id:crypto.randomUUID(),code:draft.code,name:draft.name,active:true,revision:0,latest_version:0,current_version:null,versions:[]};recipes.push(recipe);}
  recipe.code=draft.code;recipe.name=draft.name;recipe.latest_version++;
  recipe.versions.forEach(version=>{if(version.status==='draft')version.status='obsolete';});
  recipe.versions.push({recipe_id:recipe.id,version:recipe.latest_version,status:'draft',document:draft,created_at:now,created_by:actorId,approved_at:null,approved_by:null});
 } else if(change.action==='approve'){
  const version=latestRecipe(recipe!);
  if(version.status!=='draft')throw new Error('Solo se puede aprobar un borrador.');
  recipe!.versions.forEach(version=>{if(version.status==='current')version.status='obsolete';});
  version.status='current';version.approved_at=now;version.approved_by=actorId;recipe!.current_version=version.version;
 } else recipe!.active=false;
 recipe!.revision++;
 return {recipes,operations:{...store.operations,[operation]:recipe!.id}};
}
export function initialRecipes():RecipeStore {
 const ingredient=(id:string,name:string,quantity:number,unit:RecipeUnit,optional=false,alternatives:string[]=[]):RecipeIngredient=>({id,name,quantity,unit,optional,alternatives,tolerance_lower:null,tolerance_upper:null});
 const document:RecipeDraft={code:'PAN-MIGNON-PROV',name:'Pan mignón',family:'Panes',product_id:null,provisional:true,ingredients:[
  ingredient('harina','Harina 000 Cañuelas',25,'kg',false,['Harina 000 Lealtad']),
  ingredient('agua','Agua',30,'L'),ingredient('sal','Sal fina Dos Anclas',1,'kg'),
  ingredient('levadura','Levadura virgen',250,'g'),ingredient('malta','Extracto de malta',250,'g',true),
  ingredient('mejorador','Mejorador Fórmula 1',300,'g',false,['Mejorador Rinde Más'])
 ]};
 const id='b4e793b2-891b-4399-b4f3-fcb28b965681';
 return {recipes:[{id,code:document.code,name:document.name,active:true,revision:1,latest_version:1,current_version:null,versions:[{recipe_id:id,version:1,status:'draft',document,created_at:'2026-11-17T00:00:00Z',created_by:null,approved_at:null,approved_by:null}]}],operations:{}};
}
