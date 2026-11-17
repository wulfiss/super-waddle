import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialRecipes,changeRecipes,latestRecipe,normalizeRecipe,decimalAmount} from '../src/lib/recipes.ts';
const actor='admin-test';
const operation=(action,recipe,extra={})=>({action,id:recipe.id,revision:recipe.revision,request_id:crypto.randomUUID(),...extra});
test('provisional mignon is one batch with mutually exclusive flours and optional malt',()=>{
 const recipe=initialRecipes().recipes[0],draft=latestRecipe(recipe).document;
 assert.equal(draft.provisional,true);assert.equal(latestRecipe(recipe).status,'draft');
 assert.equal(draft.ingredients.length,6);
 assert.equal(draft.ingredients[0].quantity,25);
 assert.deepEqual(draft.ingredients[0].alternatives,['Harina 000 Lealtad']);
 assert.equal(draft.ingredients.find(i=>i.id==='malta').optional,true);
 assert(draft.ingredients.every(i=>i.tolerance_lower===null && i.tolerance_upper===null));
});
test('approve, edit, retry and archive preserve historical formula snapshots',()=>{
 let store=initialRecipes();const first=structuredClone(latestRecipe(store.recipes[0]).document);
 store=changeRecipes(store,'admin',actor,operation('approve',store.recipes[0]));
 const draft=structuredClone(first);draft.ingredients[0].quantity=24;
 const edit=operation('save',store.recipes[0],{draft});
 store=changeRecipes(store,'admin',actor,edit);
 assert.equal(store.recipes[0].current_version,1);
 assert.deepEqual(store.recipes[0].versions[0].document,first);
 assert.equal(latestRecipe(store.recipes[0]).status,'draft');
 assert.equal(changeRecipes(store,'admin',actor,edit),store);
 assert.throws(()=>changeRecipes(store,'admin',actor,{...edit,request_id:crypto.randomUUID()}),/cambió/);
 store=changeRecipes(store,'admin',actor,operation('approve',store.recipes[0]));
 assert.deepEqual(store.recipes[0].versions.map(v=>v.status),['obsolete','current']);
 store=changeRecipes(store,'admin',actor,operation('archive',store.recipes[0]));
 assert.equal(store.recipes[0].active,false);assert.equal(store.recipes[0].versions.length,2);
});
test('reject nonadmin writes and malformed quantities, alternatives and tolerances',()=>{
 const store=initialRecipes(),recipe=store.recipes[0],draft=latestRecipe(recipe).document;
 for(const role of ['bakery','warehouse',null])assert.throws(()=>changeRecipes(store,role,actor,operation('approve',recipe)),/administración/);
 for(const quantity of [0,-1,NaN,Infinity,1.0001]){const bad=structuredClone(draft);bad.ingredients[0].quantity=quantity;assert.throws(()=>normalizeRecipe(bad));}
 const bad=structuredClone(draft);bad.ingredients[0].alternatives.push('harina 000 cañuelas');assert.throws(()=>normalizeRecipe(bad));
 const tolerance=structuredClone(draft);tolerance.ingredients[0].tolerance_lower=5;assert.throws(()=>normalizeRecipe(tolerance));
 assert.equal(decimalAmount('0,250'),.25);assert.equal(decimalAmount('25.5'),25.5);
 for(const value of ['1,000.5','1.000,5','','-1','1e3','0.1234'])assert(Number.isNaN(decimalAmount(value)));
});
