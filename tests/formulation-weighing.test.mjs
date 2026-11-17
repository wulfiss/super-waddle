import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialRecipes,changeRecipes} from '../src/lib/recipes.ts';
import {startPreviewBatch} from '../src/lib/formulation-batches.ts';
import {changePreviewWeight,weightAmount,weightDifference,validateWeight} from '../src/lib/formulation-weighing.ts';
function fixture(){let store=initialRecipes();const recipe=store.recipes[0];store=changeRecipes(store,'admin','admin',{action:'approve',id:recipe.id,revision:1,request_id:crypto.randomUUID()});return startPreviewBatch([],store.recipes,'bakery','baker',{request_id:crypto.randomUUID(),recipe_id:recipe.id,recipe_version:1,date:'2026-11-17',responsible:'María',factor:1,selections:recipe.versions[0].document.ingredients.map(line=>({ingredient_id:line.id,choice:line.optional?null:0}))}).batches[0];}
function input(batch,id,action,extra={}){return {batch_id:batch.id,ingredient_id:id,action,request_id:crypto.randomUUID(),expected_revision:batch.weighings?.find(w=>w.ingredient_id===id)?.revision??0,...extra};}
const save=(batch,id,value,extra={})=>input(batch,id,'save',{actual_quantity:value,lot:null,expiry_date:null,...extra});
test('weight parsing, exact differences and no implicit 2 percent rule',()=>{
 assert.equal(weightAmount('0,000001'),.000001);assert.equal(weightAmount('25.500000'),25.5);
 for(const text of ['','1e3','1,000.5','-1','0.1234567'])assert(Number.isNaN(weightAmount(text)));
 for(const value of [0,-1,NaN,Infinity,.0000001,1e9+1])assert.throws(()=>validateWeight(value,null,null));
 validateWeight(25,null,null);validateWeight(25,'L-1','2020-01-01');assert.throws(()=>validateWeight(25,null,'2026-02-30'));
 assert.deepEqual(weightDifference({expected_quantity:.1,lower_limit:null,upper_limit:null},.3),{difference:.2,percent:200,within:null});
 assert.equal(weightDifference({expected_quantity:0,lower_limit:null,upper_limit:null},1).percent,null);
 assert.equal(weightDifference({expected_quantity:25,lower_limit:23.75,upper_limit:26.25},24).within,true);
});
test('save and corrections before incorporation retain history, optional metadata and stable retry IDs',()=>{
 let batch=fixture();const request=save(batch,'harina',24,{lot:' L-01 ',expiry_date:'2020-01-01'});
 batch=changePreviewWeight(batch,'bakery','baker',request,'María');assert.equal(batch.weighings[0].lot,'L-01');assert.equal(batch.weighings[0].within_tolerance,null);assert.equal(batch.weighings[0].difference_quantity,-1);
 assert.equal(changePreviewWeight(batch,'bakery','baker',request),batch);
 const before=structuredClone(batch);batch=changePreviewWeight(batch,'bakery','baker',save(batch,'harina',25));
 assert.equal(batch.events.at(-1).before_snapshot.actual_quantity,24);assert.equal(batch.events.at(-1).after_snapshot.actual_quantity,25);
 assert.equal(before.weighings[0].actual_quantity,24);assert.equal(batch.has_discrepancies,false);assert.equal(batch.had_incorporated_discrepancies,false);
 assert.throws(()=>changePreviewWeight(batch,'bakery','baker',{...request,request_id:crypto.randomUUID()}),/cambió/);
});
test('automatic closure includes deviations, keeps closure snapshot, and admin correction preserves incorporation',()=>{
 let batch=fixture();let last;
 for(const line of batch.ingredients.filter(i=>i.included)){
  batch=changePreviewWeight(batch,'bakery','baker',save(batch,line.ingredient_id,line.expected_quantity+(line.ingredient_id==='agua'?1:0)));
  last=input(batch,line.ingredient_id,'incorporate');batch=changePreviewWeight(batch,'bakery','baker',last);
 }
 assert.equal(batch.status,'closed');assert.equal(batch.has_discrepancies,true);assert.equal(batch.had_incorporated_discrepancies,true);
 assert.equal(batch.events.filter(e=>e.action==='closed').length,1);assert.equal(changePreviewWeight(batch,'bakery','baker',last),batch);
 const closedAt=batch.closed_at;
 assert.throws(()=>changePreviewWeight(batch,'bakery','baker',save(batch,'agua',30)),/confirmado/);
 const correction=input(batch,'agua','correct',{actual_quantity:30,lot:null,expiry_date:null,note:null});
 assert.throws(()=>changePreviewWeight(batch,'bakery','baker',correction),/administración/);
 batch=changePreviewWeight(batch,'admin','admin',correction);
 assert.equal(batch.status,'closed');assert.equal(batch.closed_at,closedAt);assert.equal(batch.has_discrepancies,false);assert.equal(batch.had_incorporated_discrepancies,true);
 assert.equal(batch.weighings.find(w=>w.ingredient_id==='agua').incorporated,true);
 assert.equal(batch.events.find(e=>e.action==='closed').after_snapshot.weighings.find(w=>w.ingredient_id==='agua').actual_quantity,31);
 assert.equal(batch.events.at(-1).action,'weight_corrected');assert.equal(batch.events.at(-1).before_snapshot.actual_quantity,31);
});
test('cannot incorporate unsaved weight, omitted ingredient, or another operator’s batch',()=>{
 const batch=fixture();
 assert.throws(()=>changePreviewWeight(batch,'bakery','baker',input(batch,'harina','incorporate')),/Registrá/);
 assert.throws(()=>changePreviewWeight(batch,'bakery','baker',save(batch,'malta',1)),/incluido/);
 for(const [role,actor]of [['bakery','other'],['warehouse','baker'],[null,'baker']])assert.throws(()=>changePreviewWeight(batch,role,actor,save(batch,'harina',25)),/permisos/);
});
