import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';

test('weighings, incorporation and closure are transactional, auditable and owner/admin protected',async t=>{
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
  await db.query("update public.user_roles set role='admin' where user_id=$1",[admin]);await db.query("update public.user_roles set role='warehouse' where user_id=$1",[warehouse]);
  async function asUser(id,fn,role='authenticated'){
   await db.exec('begin');try{await db.exec(`set local role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id??'']);const result=await fn();await db.exec('commit');return result;}catch(error){await db.exec('rollback');throw error;}
  }
  const recipe=(await db.query("select * from public.formulation_recipes where code='PAN-MIGNON-PROV'")).rows[0];
  await asUser(admin,()=>db.query("select public.manage_formulation_recipe($1,'approve',$2,1,null)",[crypto.randomUUID(),recipe.id]));
  const document=(await db.query('select document from public.formulation_recipe_versions where recipe_id=$1 and version=1',[recipe.id])).rows[0].document;
  const choices=document.ingredients.map(line=>({ingredient_id:line.id,choice:line.optional?null:0}));
  const batchId=(await asUser(bakery,()=>db.query("select public.start_formulation_batch($1,$2,1,'2026-11-17','María',1,$3) as id",[crypto.randomUUID(),recipe.id,choices]))).rows[0].id;
  async function change(actor,id,action,revision,options={}){
   const {quantity=null,lot=null,expiry=null,note=null,request=crypto.randomUUID(),batch=batchId}=options;
   return (await asUser(actor,()=>db.query('select public.record_formulation_weight($1,$2,$3,$4,$5,$6,$7,$8,$9) as batch',[request,batch,id,revision,action,quantity,lot,expiry,note]))).rows[0].batch;
  }
  let result,closedAt;
  await t.test('unsaved, omitted, invalid and unauthorized weights cannot mutate or leak data',async()=>{
   for(const actor of [other,warehouse,null])await assert.rejects(change(actor,'harina','save',0,{quantity:25}),/access|Authentication/);
   await assert.rejects(change(bakery,'malta','save',0,{quantity:250}),/not included/);
   await assert.rejects(change(bakery,'harina','incorporate',0),/Save weight/);
   for(const quantity of [0,-1,.0000001,1000000001])await assert.rejects(change(bakery,'harina','save',0,{quantity}),/quantity/);
   await assert.rejects(change(bakery,'harina','save',0,{quantity:25,expiry:'2026-02-30'}));
   for(const actor of [admin,bakery,warehouse]){
    await assert.rejects(asUser(actor,()=>db.query('delete from public.formulation_weighings')),/permission denied/);
    await assert.rejects(asUser(actor,()=>db.query("update public.formulation_weighings set actual_quantity=1")),/permission denied/);
    await assert.rejects(asUser(actor,()=>db.query('select private.formulation_batch_detail($1)',[batchId])),/permission denied/);
   }
   await assert.rejects(asUser(null,()=>db.query('select * from public.formulation_weighings'),'anon'),/permission denied/);
   assert.equal((await db.query('select count(*)::int as n from public.formulation_weighings')).rows[0].n,0);
   assert.equal((await db.query('select count(*)::int as n from public.formulation_batch_events')).rows[0].n,1);
  });
  await t.test('save has no implicit tolerance or required traceability; retry and stale guards preserve exact history',async()=>{
   const request=crypto.randomUUID();result=await change(bakery,'harina','save',0,{quantity:24,lot:' LOT-01 ',expiry:'2020-01-01',request});
   const weight=result.weighings[0];assert.equal(weight.actual_quantity,24);assert.equal(weight.expected_quantity,25);assert.equal(weight.difference_quantity,-1);assert.equal(weight.difference_percent,-4);assert.equal(weight.within_tolerance,null);
   assert.equal(weight.lot,'LOT-01');assert.equal(weight.expiry_date,'2020-01-01');assert.equal(weight.revision,1);assert.equal(result.status,'in_progress');
   assert.equal((await change(bakery,'harina','save',0,{quantity:24,request})).events.length,2);
   await assert.rejects(change(bakery,'harina','save',0,{quantity:100}),/revision/);
   result=await change(bakery,'harina','save',1,{quantity:25});
   const correction=result.events.filter(e=>e.action==='weight_saved').at(-1);assert.equal(correction.before_snapshot.actual_quantity,24);assert.equal(correction.after_snapshot.actual_quantity,25);assert.equal(correction.actor_name,bakery+'@example.test');
   assert.equal(result.has_discrepancies,false);assert.equal(result.had_incorporated_discrepancies,false);
   await assert.rejects(change(bakery,'harina','incorporate',2,{quantity:100}),/Save changes/);
   result=await change(bakery,'harina','incorporate',2);
   assert.equal(result.weighings.find(w=>w.ingredient_id==='harina').incorporated,true);
   await assert.rejects(change(bakery,'harina','save',3,{quantity:1}),/incorporated/);
  });
  await t.test('all selected ingredients must be saved and incorporated; closure retains deviations without a reason',async()=>{
   const included=result.ingredients.filter(line=>line.included&&line.ingredient_id!=='harina');
   for(const [index,line]of included.entries()){
    result=await change(bakery,line.ingredient_id,'save',0,{quantity:line.expected_quantity+(line.ingredient_id==='agua'?1:0)});
    assert.equal(result.status,'in_progress');
    const request=crypto.randomUUID();result=await change(bakery,line.ingredient_id,'incorporate',1,{request});
    if(index<included.length-1)assert.equal(result.status,'in_progress');
    if(index===included.length-1){const retry=await change(bakery,line.ingredient_id,'incorporate',1,{request});assert.equal(retry.events.filter(e=>e.action==='closed').length,1);}
   }
   assert.equal(result.status,'closed');assert.equal(result.has_discrepancies,true);assert.equal(result.had_incorporated_discrepancies,true);assert.equal(result.closed_by,bakery);closedAt=result.closed_at;
   const closed=result.events.find(e=>e.action==='closed');assert.equal(closed.after_snapshot.weighings.find(w=>w.ingredient_id==='agua').actual_quantity,31);
   assert.equal(result.weighings.length,5);assert.equal(result.events.filter(e=>e.action==='closed').length,1);
   await assert.rejects(change(bakery,'agua','save',2,{quantity:30}),/closed|incorporated/);
   await assert.rejects(change(bakery,'agua','correct',2,{quantity:30}),/Admin correction/);
  });
  await t.test('only admin may correct incorporated records; closed snapshot and incorporation stay intact',async()=>{
   result=await change(admin,'agua','correct',2,{quantity:30,lot:'REVISED',note:null});
   assert.equal(result.status,'closed');assert.equal(result.closed_at,closedAt);assert.equal(result.has_discrepancies,false);assert.equal(result.had_incorporated_discrepancies,true);
   const weight=result.weighings.find(w=>w.ingredient_id==='agua');assert.equal(weight.actual_quantity,30);assert.equal(weight.incorporated,true);assert.equal(weight.incorporated_by,bakery);assert.equal(weight.recorded_by,admin);
   const event=result.events.at(-1);assert.equal(event.action,'weight_corrected');assert.equal(event.before_snapshot.actual_quantity,31);assert.equal(event.after_snapshot.actual_quantity,30);assert.equal(event.note,null);
   assert.equal(result.events.find(e=>e.action==='closed').after_snapshot.weighings.find(w=>w.ingredient_id==='agua').actual_quantity,31);
   await assert.rejects(change(admin,'agua','correct',2,{quantity:200}),/revision/);
   for(const actor of [other,warehouse]){
    assert.equal((await asUser(actor,()=>db.query('select * from public.formulation_weighings'))).rows.length,0);
    assert.equal((await asUser(actor,()=>db.query('select * from public.formulation_batch_events'))).rows.length,0);
   }
   assert.equal((await asUser(bakery,()=>db.query('select * from public.formulation_weighings'))).rows.length,5);
   assert.equal((await asUser(admin,()=>db.query('select * from public.formulation_weighings'))).rows.length,5);
  });
  await t.test('approved per-ingredient tolerance is respected and an out-of-range batch still closes',async()=>{
   const doc=structuredClone(document);doc.code='TOLERANCE-TEST';doc.ingredients=[{...doc.ingredients[0],alternatives:[],tolerance_lower:5,tolerance_upper:5}];
   const id=(await asUser(admin,()=>db.query("select public.manage_formulation_recipe($1,'save',null,null,$2) as id",[crypto.randomUUID(),doc]))).rows[0].id;
   await asUser(admin,()=>db.query("select public.manage_formulation_recipe($1,'approve',$2,1,null)",[crypto.randomUUID(),id]));
   const batch=(await asUser(bakery,()=>db.query("select public.start_formulation_batch($1,$2,1,'2026-11-17','María',1,$3) as id",[crypto.randomUUID(),id,[{ingredient_id:'harina',choice:0}]]))).rows[0].id;
   let record=await change(bakery,'harina','save',0,{quantity:24,batch});assert.equal(record.weighings[0].within_tolerance,true);
   record=await change(bakery,'harina','save',1,{quantity:27,batch});assert.equal(record.weighings[0].within_tolerance,false);
   record=await change(bakery,'harina','incorporate',2,{batch});assert.equal(record.status,'closed');assert.equal(record.has_discrepancies,true);
  });
  await t.test('single submission is atomic, idempotent and closes with actual weights',async()=>{
   const weights=document.ingredients.filter(i=>!i.optional).map(i=>({ingredient_id:i.id,actual_quantity:i.quantity+(i.id==='agua'?1:0),lot:null,expiry_date:null}));
   const call=(actor,request,entries)=>asUser(actor,()=>db.query("select public.complete_formulation_batch($1,$2,1,'2026-11-18','Entrada rápida',1,$3,$4) as batch",[request,recipe.id,choices,entries]));
   const before=(await db.query('select count(*)::int as n from public.formulation_batches')).rows[0].n;
   const bad=structuredClone(weights);bad.at(-1).actual_quantity=0;
   await assert.rejects(call(bakery,crypto.randomUUID(),bad),/quantity/);
   assert.equal((await db.query('select count(*)::int as n from public.formulation_batches')).rows[0].n,before);
   const request=crypto.randomUUID(),saved=(await call(bakery,request,weights)).rows[0].batch;
   assert.equal(saved.status,'closed');assert.equal(saved.weighings.length,5);assert.equal(saved.has_discrepancies,true);
   assert(saved.weighings.every(w=>w.incorporated));assert.equal(saved.events.filter(e=>e.action==='closed').length,1);
   const retry=(await call(bakery,request,weights)).rows[0].batch;assert.equal(retry.id,saved.id);assert.equal(retry.events.length,saved.events.length);
   assert.equal((await db.query('select count(*)::int as n from public.formulation_batches')).rows[0].n,before+1);
   await assert.rejects(call(warehouse,crypto.randomUUID(),weights),/access required/);
  });
  await t.test('brand portions survive save, incorporation, closure and retry; incomplete splits roll back',async()=>{
   const brands=[
    {name:'Molino A',actual_quantity:10.5,lot:'L1',expiry_date:'2027-01-01'},
    {name:'Otro molino',actual_quantity:14.5,lot:'L2',expiry_date:'2027-02-02'}
   ];
   const weights=document.ingredients.filter(i=>!i.optional).map(i=>({ingredient_id:i.id,actual_quantity:i.quantity,lot:null,expiry_date:null,...(i.id==='harina'?{brands}:{})}));
   const call=(request,entries,confirm)=>asUser(bakery,()=>db.query("select public.save_formulation_batch_weights($1,$2,1,'2026-11-18','Turno',1,$3,$4,$5) as batch",[request,recipe.id,choices,entries,confirm]));
   const request=crypto.randomUUID();
   const flour=weights.find(w=>w.ingredient_id==='harina');
   for(const changed of [{expiry_date:null},{lot:' '},{actual_quantity:15}]) {
    const bad={...flour,brands:[brands[0],{...brands[1],...changed}]};
    await assert.rejects(call(request,[bad],false),/brand_totals/);
   }
   const draft=(await call(request,[flour],false)).rows[0].batch;
   assert.equal(draft.status,'in_progress');assert.deepEqual(draft.weighings[0].brands,brands);
   const id=crypto.randomUUID(),saved=(await call(id,weights,true)).rows[0].batch;
   const closed=saved.events.find(e=>e.action==='closed');
   assert.deepEqual(closed.after_snapshot.weighings.find(w=>w.ingredient_id==='harina').brands,brands);
   assert.deepEqual((await call(id,weights,true)).rows[0].batch,saved);
  });
  await t.test('revoked roles cannot retry previous operations or read their historical weights',async()=>{
   await db.query("update public.user_roles set role='warehouse' where user_id=$1",[bakery]);
   await assert.rejects(change(bakery,'agua','save',3,{quantity:30}),/access required/);
   assert.equal((await asUser(bakery,()=>db.query('select * from public.formulation_weighings'))).rows.length,0);
   assert.equal((await asUser(bakery,()=>db.query('select * from public.formulation_batch_events'))).rows.length,0);
   assert.equal((await db.query('select count(*)::int as n from public.productions')).rows[0].n,0);
  });
 }finally{await db.close();}
});
