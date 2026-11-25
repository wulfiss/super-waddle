import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {initialRecipes,latestRecipe} from '../src/lib/recipes.ts';

test('recipe database enforces authorization, immutable versions, retry safety and archive history',async t=>{
 const db=new PGlite();
 const admin='11111111-1111-4111-8111-111111111111',bakery='22222222-2222-4222-8222-222222222222',warehouse='33333333-3333-4333-8333-333333333333';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key,email text,deleted_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
   alter default privileges in schema public grant all on tables to anon,authenticated;
   alter default privileges in schema public grant all on functions to anon,authenticated;`);
  for(const id of [admin,bakery,warehouse])await db.query('insert into auth.users(id,email) values($1,$2)',[id,id+'@example.test']);
  const directory=new URL('../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(directory)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,directory),'utf8'));
  await db.query("update public.user_roles set role='admin' where user_id=$1",[admin]);
  await db.query("update public.user_roles set role='warehouse' where user_id=$1",[warehouse]);
  async function asUser(id,fn,role='authenticated'){
   await db.exec('begin');try{await db.exec(`set local role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id??'']);const result=await fn();await db.exec('commit');return result;}catch(error){await db.exec('rollback');throw error;}
  }
  const draft=latestRecipe(initialRecipes().recipes[0]).document;draft.code='TEST-RECIPE';
  const call=(actor,action,id=null,revision=null,document=null,request=crypto.randomUUID())=>asUser(actor,()=>db.query('select public.manage_formulation_recipe($1,$2,$3,$4,$5) as id',[request,action,id,revision,document]));
  let id;
  await t.test('only admins can create; anonymous access and direct writes fail closed',async()=>{
   for(const actor of [bakery,warehouse])await assert.rejects(call(actor,'save',null,null,draft),/Administrator/);
   await assert.rejects(call(null,'save',null,null,draft),/Authentication/);
   await assert.rejects(asUser(null,()=>db.query('select * from public.formulation_recipes'),'anon'),/permission denied/);
   for(const actor of [admin,bakery,warehouse]){
    await assert.rejects(asUser(actor,()=>db.query("insert into public.formulation_recipes(code,name) values('X','X')")),/permission denied/);
    await assert.rejects(asUser(actor,()=>db.query("select private.validate_formulation_document($1)",[draft])),/permission denied/);
   }
   const request=crypto.randomUUID();id=(await call(admin,'save',null,null,draft,request)).rows[0].id;
   assert.equal((await call(admin,'save',null,null,draft,request)).rows[0].id,id);
   assert.equal((await db.query('select count(*)::int as n from public.formulation_recipes')).rows[0].n,2);
   assert.equal((await asUser(bakery,()=>db.query('select * from public.formulation_recipe_versions'))).rows.length,0);
  });
  await t.test('invalid drafts rollback without changing version or audit; codes are unique',async()=>{
   for(const value of [0,-1,1.0001]){const bad=structuredClone(draft);bad.ingredients[0].quantity=value;await assert.rejects(call(admin,'save',id,1,bad),/quantity/);}
   const bad=structuredClone(draft);bad.ingredients[0].alternatives.push('HARINA 000 CAÑUELAS');await assert.rejects(call(admin,'save',id,1,bad),/alternative/);
   const tolerance=structuredClone(draft);tolerance.ingredients[0].tolerance_lower=5;await assert.rejects(call(admin,'save',id,1,tolerance),/tolerances/);
   await assert.rejects(call(admin,'save',null,null,draft),/unique/);
   assert.equal((await db.query('select revision from public.formulation_recipes where id=$1',[id])).rows[0].revision,1);
   assert.equal((await db.query('select count(*)::int as n from public.formulation_recipe_events')).rows[0].n,1);
  });
  await t.test('approval publishes only current formula to bakery; edits keep old approved contents',async()=>{
   await call(admin,'approve',id,1);
   assert.equal((await asUser(bakery,()=>db.query('select * from public.formulation_recipe_versions'))).rows[0].status,'current');
   const updated=structuredClone(draft);updated.ingredients[0].quantity=24;updated.name='Mignón revisado';
   await call(admin,'save',id,2,updated);
   const versions=(await db.query('select * from public.formulation_recipe_versions where recipe_id=$1 order by version',[id])).rows;
   assert.deepEqual(versions.map(v=>v.status),['current','draft']);assert.deepEqual(versions[0].document,draft);
   const visible=(await asUser(bakery,()=>db.query('select * from public.formulation_recipe_versions'))).rows;
   assert.equal(visible.length,1);assert.equal(visible[0].document.ingredients[0].quantity,25);
   await assert.rejects(call(admin,'approve',id,2),/revision/);
   await call(admin,'approve',id,3);
   assert.deepEqual((await db.query('select status from public.formulation_recipe_versions where recipe_id=$1 order by version',[id])).rows.map(v=>v.status),['obsolete','current']);
   for(const actor of [admin,bakery,warehouse])await assert.rejects(asUser(actor,()=>db.query("update public.formulation_recipe_versions set document='{}'")),/permission denied/);
   assert.equal((await asUser(warehouse,()=>db.query('select * from public.formulation_recipes'))).rows.length,0);
   assert.equal((await asUser(bakery,()=>db.query('select * from public.formulation_recipe_events'))).rows.length,0);
  });
  await t.test('archiving retains formulas and actor audit while removing availability',async()=>{
   const request=crypto.randomUUID();await call(admin,'archive',id,4,null,request);
   await call(admin,'archive',id,4,null,request);
   assert.equal((await asUser(bakery,()=>db.query('select * from public.formulation_recipe_versions'))).rows.length,0);
   assert.equal((await db.query('select count(*)::int as n from public.formulation_recipe_versions where recipe_id=$1',[id])).rows[0].n,2);
   const events=(await asUser(admin,()=>db.query('select * from public.formulation_recipe_events order by occurred_at'))).rows;
   assert.deepEqual(events.map(e=>e.action),['save','approve','save','approve','archive']);
   assert(events.every(e=>e.actor_id===admin));assert.equal(events.at(-1).after_snapshot.recipe.active,false);
   await assert.rejects(call(admin,'save',id,5,draft),/unavailable/);
  });
 }finally{await db.close();}
});
