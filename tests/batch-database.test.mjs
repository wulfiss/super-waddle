import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {initialRecipes,latestRecipe} from '../src/lib/recipes.ts';

test('formulation starts are authorized, atomic, idempotent and preserve historical recipes',async t=>{
 const db=new PGlite();
 const admin='11111111-1111-4111-8111-111111111111',bakery='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',warehouse='44444444-4444-4444-8444-444444444444';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key,email text,deleted_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
   alter default privileges in schema public grant all on tables to anon,authenticated;
   alter default privileges in schema public grant all on functions to anon,authenticated;`);
  for(const id of [admin,bakery,other,warehouse])await db.query('insert into auth.users(id,email) values($1,$2)',[id,id+'@example.test']);
  const directory=new URL('../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(directory)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,directory),'utf8'));
  await db.query("update public.user_roles set role='admin' where user_id=$1",[admin]);
  await db.query("update public.user_roles set role='warehouse' where user_id=$1",[warehouse]);
  async function asUser(id,fn,role='authenticated'){
   await db.exec('begin');try{await db.exec(`set local role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id??'']);const result=await fn();await db.exec('commit');return result;}catch(error){await db.exec('rollback');throw error;}
  }
  const recipe=(await db.query("select * from public.formulation_recipes where code='PAN-MIGNON-PROV'")).rows[0];
  const document=latestRecipe(initialRecipes().recipes[0]).document;
  const choices=document.ingredients.map(line=>({ingredient_id:line.id,choice:line.optional?null:line.id==='harina'?1:0}));
  const start=(actor,options={})=>{
   const {request=crypto.randomUUID(),version=2,date='2026-11-17',responsible=' María ',factor=2,selections=choices}=options;
   return asUser(actor,()=>db.query('select public.start_formulation_batch($1,$2,$3,$4,$5,$6,$7) as id',[request,recipe.id,version,date,responsible,factor,selections]));
  };
  const manage=(action,revision,doc=null)=>asUser(admin,()=>db.query('select public.manage_formulation_recipe($1,$2,$3,$4,$5)',[crypto.randomUUID(),action,recipe.id,revision,doc]));
  let firstId;const firstRequest=crypto.randomUUID();
  await t.test('drafts and unauthorized callers cannot start; anonymous and direct access fail closed',async()=>{
   await assert.rejects(start(bakery,{version:1}),/Recipe version/);
   for(const actor of [warehouse,null])await assert.rejects(start(actor),/access required|Authentication/);
   await assert.rejects(asUser(null,()=>db.query('select * from public.formulation_batches'),'anon'),/permission denied/);
   for(const actor of [admin,bakery,warehouse]){
    await assert.rejects(asUser(actor,()=>db.query("update public.formulation_batches set responsible='Changed'")),/permission denied/);
    await assert.rejects(asUser(actor,()=>db.query('delete from public.formulation_batch_events')),/permission denied/);
   }
   document.ingredients[0].tolerance_lower=5;document.ingredients[0].tolerance_upper=10;
   await manage('save',1,document);await manage('approve',2);
  });
  await t.test('server calculates one alternative, scaled limits and omitted ingredients; retries do not duplicate',async()=>{
   firstId=(await start(bakery,{request:firstRequest})).rows[0].id;
   assert.equal((await start(bakery,{request:firstRequest})).rows[0].id,firstId);
   const batch=(await asUser(bakery,()=>db.query('select * from public.formulation_batches where id=$1',[firstId]))).rows[0];
   assert.equal(batch.responsible,'María');assert.equal(batch.recipe_version,2);
   assert.equal(batch.ingredients.length,6);assert.equal(batch.ingredients[0].name,'Harina 000 Lealtad');assert.equal(batch.ingredients[0].expected_quantity,50);
   assert.equal(batch.ingredients[0].lower_limit,47.5);assert.equal(batch.ingredients[0].upper_limit,55);
   assert.equal(batch.ingredients.find(i=>i.ingredient_id==='agua').expected_quantity,60);
   assert.equal(batch.ingredients.find(i=>i.ingredient_id==='agua').lower_limit,null);
   assert.equal(batch.ingredients.find(i=>i.ingredient_id==='malta').included,false);
   assert.equal(batch.ingredients.find(i=>i.ingredient_id==='malta').expected_quantity,0);
   assert.equal((await db.query('select count(*)::int as n from public.formulation_batches')).rows[0].n,1);
   const events=(await asUser(bakery,()=>db.query('select * from public.formulation_batch_events'))).rows;
   assert.equal(events.length,1);assert.equal(events[0].actor_id,bakery);assert.deepEqual(events[0].after_snapshot.ingredients,batch.ingredients);
  });
  await t.test('invalid factors, missing choices, unknown ingredients and invalid dates leave no partial batch',async()=>{
   for(const factor of [0,-1,.0001,1001])await assert.rejects(start(bakery,{factor}),/factor/);
   await assert.rejects(start(bakery,{date:'2026-02-30'}));
   await assert.rejects(start(bakery,{responsible:' '}),/details/);
   await assert.rejects(start(bakery,{selections:choices.slice(1)}),/choices/);
   for(const choice of [null,-1,2,.5,'0',true])await assert.rejects(start(bakery,{selections:choices.map((s,i)=>i===0?{...s,choice}:s)}));
   await assert.rejects(start(bakery,{selections:choices.map((s,i)=>i===0?{...s,ingredient_id:'unknown'}:s)}),/choice/);
   await assert.rejects(start(bakery,{selections:choices.map((s,i)=>i===1?choices[0]:s)}),/choices/);
   assert.equal((await db.query('select count(*)::int as n from public.formulation_batches')).rows[0].n,1);
   assert.equal((await db.query('select count(*)::int as n from public.formulation_batch_events')).rows[0].n,1);
  });
  await t.test('bakery sees only own batches, admin sees all and revoked roles lose read and start access',async()=>{
   await start(admin,{factor:.5,responsible:'Calidad'});
   assert.equal((await asUser(admin,()=>db.query('select * from public.formulation_batches'))).rows.length,2);
   assert.equal((await asUser(bakery,()=>db.query('select * from public.formulation_batches'))).rows.length,1);
   for(const actor of [other,warehouse]){
    assert.equal((await asUser(actor,()=>db.query('select * from public.formulation_batches'))).rows.length,0);
    assert.equal((await asUser(actor,()=>db.query('select * from public.formulation_batch_events'))).rows.length,0);
   }
   await db.query("update public.user_roles set role='warehouse' where user_id=$1",[bakery]);
   assert.equal((await asUser(bakery,()=>db.query('select * from public.formulation_batches'))).rows.length,0);
   await assert.rejects(start(bakery,{request:firstRequest}),/access required/);
   await db.query("update public.user_roles set role='bakery' where user_id=$1",[bakery]);
  });
  await t.test('new recipe versions and archiving preserve existing snapshots and reject stale starts',async()=>{
   const updated=structuredClone(document);updated.ingredients[0].quantity=24;updated.name='Pan revisado';
   await manage('save',3,updated);await manage('approve',4);
   await assert.rejects(start(bakery),/Recipe version/);
   const currentId=(await start(bakery,{version:3,factor:1})).rows[0].id;
   await manage('archive',5);
   await assert.rejects(start(bakery,{version:3}),/Recipe version/);
   assert.equal((await start(bakery,{request:firstRequest})).rows[0].id,firstId);
   const records=(await asUser(bakery,()=>db.query('select * from public.formulation_batches order by created_at'))).rows;
   assert.equal(records.length,2);assert.deepEqual(records[0].recipe_snapshot,document);
   assert.equal(records[0].ingredients[0].expected_quantity,50);
   assert.equal(records.find(b=>b.id===currentId).ingredients[0].expected_quantity,24);
   assert.equal((await db.query('select count(*)::int as n from public.productions')).rows[0].n,0);
  });
 }finally{await db.close();}
});
