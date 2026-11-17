import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialRecipes,latestRecipe,changeRecipes} from '../src/lib/recipes.ts';
import {approvedRecipes,batchPlan,scaledQuantity,startPreviewBatch,visibleBatches,validateBatchDetails} from '../src/lib/formulation-batches.ts';
const actor='preview-bakery';
function fixture(){let store=initialRecipes();store=changeRecipes(store,'admin','preview-admin',{action:'approve',id:store.recipes[0].id,revision:1,request_id:crypto.randomUUID()});return store;}
function request(recipe){return {request_id:crypto.randomUUID(),recipe_id:recipe.id,recipe_version:recipe.current_version,date:'2026-11-17',responsible:' María ',factor:2,selections:latestRecipe(recipe).document.ingredients.map(line=>({ingredient_id:line.id,choice:line.optional?null:line.id==='harina'?1:0}))};}
test('one selected flour, optional exclusion, scaling and snapshot remain correct after recipe changes',()=>{
 const store=fixture(),recipe=store.recipes[0],input=request(recipe);
 const result=startPreviewBatch([],store.recipes,'bakery',actor,input),batch=result.batches[0];
 assert.equal(batch.responsible,'María');assert.equal(batch.date,input.date);assert.equal(batch.status,'in_progress');
 assert.equal(batch.ingredients.length,6);
 assert.equal(batch.ingredients[0].name,'Harina 000 Lealtad');assert.equal(batch.ingredients[0].expected_quantity,50);
 assert.equal(batch.ingredients.find(i=>i.ingredient_id==='agua').expected_quantity,60);
 assert.equal(batch.ingredients.find(i=>i.ingredient_id==='malta').included,false);
 assert.equal(batch.ingredients.find(i=>i.ingredient_id==='malta').expected_quantity,0);
 assert.equal(startPreviewBatch(result.batches,[], 'bakery',actor,input).id,result.id);
 recipe.versions[0].document.ingredients[0].quantity=100;
 assert.equal(batch.recipe_snapshot.ingredients[0].quantity,25);
 assert.equal(batch.ingredients[0].expected_quantity,50);
 assert.equal(visibleBatches(result.batches,'bakery','other').length,0);
 assert.equal(visibleBatches(result.batches,'admin','admin').length,1);
 assert.equal(visibleBatches(result.batches,'warehouse',actor).length,0);
});
test('drafts, old versions, archived recipes and unauthorized starts are rejected',()=>{
 const draft=initialRecipes(),recipe=draft.recipes[0],input=request(recipe);input.recipe_version=1;
 assert.equal(approvedRecipes(draft.recipes).length,0);
 assert.throws(()=>startPreviewBatch([],draft.recipes,'bakery',actor,input),/vigente/);
 const store=fixture();for(const role of ['warehouse',null])assert.throws(()=>startPreviewBatch([],store.recipes,role,actor,input),/panadería/);
 assert.throws(()=>startPreviewBatch([],store.recipes,'bakery',actor,{...input,recipe_version:0}),/vigente/);
 store.recipes[0].active=false;assert.throws(()=>startPreviewBatch([],store.recipes,'bakery',actor,input),/vigente/);
});
test('positive fractional batches preserve small expected quantities and approved tolerance limits',()=>{
 assert.equal(scaledQuantity(.001,.001),.000001);assert.equal(scaledQuantity(.1,.2),.02);
 const store=fixture(),document=store.recipes[0].versions[0].document,input=request(store.recipes[0]);
 document.ingredients[0].tolerance_lower=5;document.ingredients[0].tolerance_upper=10;
 const plan=batchPlan(document,.5,input.selections);assert.equal(plan[0].expected_quantity,12.5);assert.equal(plan[0].lower_limit,11.875);assert.equal(plan[0].upper_limit,13.75);
 assert.equal(plan[1].lower_limit,null);assert.equal(plan[1].upper_limit,null);
 assert.throws(()=>scaledQuantity(1e9,1000),/máximo/);
});
test('dates, responsible, factor and ingredient choices cannot be silently coerced',()=>{
 const store=fixture(),recipe=store.recipes[0],input=request(recipe),document=latestRecipe(recipe).document;
 for(const factor of [0,-1,NaN,Infinity,.0001,1001])assert.throws(()=>validateBatchDetails({...input,factor}));
 for(const date of ['','2026-02-30','0000-01-01'])assert.throws(()=>validateBatchDetails({...input,date}));
 assert.throws(()=>validateBatchDetails({...input,responsible:' '}));
 for(const choice of [-1,2,NaN,null])assert.throws(()=>batchPlan(document,2,input.selections.map((s,i)=>i===0?{...s,choice}:s)));
 assert.throws(()=>batchPlan(document,2,input.selections.slice(1)));
 assert.throws(()=>batchPlan(document,2,input.selections.map((s,i)=>i===1?input.selections[0]:s)));
});
