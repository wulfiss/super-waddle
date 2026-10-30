import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('order updates, cancellations and admin audit are transactional and role protected',async t=>{
 const db=new PGlite();
 const bakery='11111111-1111-4111-8111-111111111111';
 const other='22222222-2222-4222-8222-222222222222';
 const warehouse='33333333-3333-4333-8333-333333333333';
 const admin='44444444-4444-4444-8444-444444444444';
 try {
  await db.exec(`
   create role anon nologin; create role authenticated nologin;
   create schema auth; create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to anon,authenticated;
   grant execute on function auth.uid() to anon,authenticated;
   alter default privileges in schema public grant all on tables to anon,authenticated;
   alter default privileges in schema public grant all on functions to anon,authenticated;
  `);
  for(const [index,id] of [bakery,other,warehouse,admin].entries())await db.query('insert into auth.users values($1,$2)',[id,`staff${index}@example.test`]);
  const directory=new URL('../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(directory)).filter(name=>name.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,directory),'utf8'));
  await db.exec(await readFile(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
  await db.query("update public.user_roles set role='warehouse' where user_id=$1",[warehouse]);
  await db.query("update public.user_roles set role='admin' where user_id=$1",[admin]);
  const product=(await db.query("select * from public.products where name='Masa para pizza'")).rows[0];
  const items=quantity=>JSON.stringify([{product_id:product.id,quantity}]);
  async function asUser(id,fn,role='authenticated') {
   await db.exec('begin');
   try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id??'']);
    const result=await fn();await db.exec('commit');return result;
   }catch(error){await db.exec('rollback');throw error;}
  }
  const save=(actor=bakery)=>asUser(actor,()=>db.query("select public.save_production('2026-10-30','María',$1::jsonb) as id",[items(2)]));
  const edit=(actor,id,revision=1,quantity=4)=>asUser(actor,()=>db.query("select public.edit_production($1,$2,'2026-10-31','Juan',$3::jsonb)",[id,revision,items(quantity)]));
  const cancel=(actor,id,revision)=>asUser(actor,()=>db.query('select public.cancel_production($1,$2)',[id,revision]));
  const orderId=(await save()).rows[0].id;
  await t.test('creation has a trusted actor and complete order snapshot',async()=>{
   const event=(await asUser(admin,()=>db.query('select * from public.production_audit'))).rows[0];
   assert.equal(event.action,'created');assert.equal(event.actor_id,bakery);assert.equal(event.actor_name,'staff0@example.test');
   assert.equal(event.before_snapshot,null);assert.equal(event.after_snapshot.items[0].quantity,2);
  });
  await t.test('warehouse and other bakery staff cannot edit or remove this order',async()=>{
   for(const actor of [warehouse,other]) {
    await assert.rejects(edit(actor,orderId),/access required|unavailable/);
    await assert.rejects(cancel(actor,orderId,1),/access required|unavailable/);
   }
   await assert.rejects(edit(null,orderId),/Authentication required/);
   await assert.rejects(asUser(null,()=>db.query('select public.cancel_production($1,1)',[orderId]),'anon'),/permission denied/);
  });
  await t.test('invalid edits roll back header, items, revision and audit together',async()=>{
   for(const quantity of [0,-1,null,'NaN','Infinity'])await assert.rejects(edit(bakery,orderId,1,quantity));
   const order=(await db.query('select * from public.productions where id=$1',[orderId])).rows[0];
   assert.equal(order.revision,1);assert.equal(order.responsible,'María');
   assert.equal(Number((await db.query('select quantity from public.production_items where production_id=$1',[orderId])).rows[0].quantity),2);
   assert.equal((await db.query('select * from public.production_audit')).rows.length,1);
  });
  await t.test('an edit changes the same warehouse order and retains exact before/after values',async()=>{
   await edit(bakery,orderId);
   const order=(await asUser(warehouse,()=>db.query('select * from public.productions'))).rows[0];
   assert.equal(order.id,orderId);assert.equal(order.revision,2);assert.equal(order.responsible,'Juan');
   const line=(await asUser(warehouse,()=>db.query('select * from public.production_items'))).rows[0];
   assert.equal(Number(line.quantity),4);
   const event=(await db.query("select * from public.production_audit where action='edited'")).rows[0];
   assert.equal(event.before_snapshot.items[0].quantity,2);assert.equal(event.after_snapshot.items[0].quantity,4);
   assert.equal(event.before_snapshot.responsible,'María');assert.equal(event.after_snapshot.responsible,'Juan');
  });
  await t.test('stale changes cannot overwrite or cancel a newer revision',async()=>{
   await assert.rejects(edit(bakery,orderId,1),/revision changed/);
   await assert.rejects(cancel(bakery,orderId,1),/revision changed/);
   await assert.rejects(cancel(bakery,orderId,null),/revision changed/);
   assert.equal((await db.query('select * from public.production_audit')).rows.length,2);
  });
  await t.test('cancellation hides the order and items while preserving its audit and physical rows',async()=>{
   await cancel(bakery,orderId,2);
   for(const actor of [bakery,warehouse,admin]) {
    assert.equal((await asUser(actor,()=>db.query('select * from public.productions'))).rows.length,0);
    assert.equal((await asUser(actor,()=>db.query('select * from public.production_items'))).rows.length,0);
   }
   assert.equal((await db.query('select * from public.productions')).rows.length,1);
   assert.equal((await db.query('select * from public.production_items')).rows.length,1);
   const event=(await asUser(admin,()=>db.query("select * from public.production_audit where action='cancelled'"))).rows[0];
   assert.equal(event.before_snapshot.items[0].quantity,4);assert.equal(event.after_snapshot.status,'cancelled');
   await assert.rejects(cancel(bakery,orderId,3),/unavailable/);
   await assert.rejects(edit(bakery,orderId,3),/unavailable/);
  });
  await t.test('only admin can read audit; all app roles are denied audit writes and private helpers',async()=>{
   for(const actor of [bakery,other,warehouse])assert.equal((await asUser(actor,()=>db.query('select * from public.production_audit'))).rows.length,0);
   for(const actor of [bakery,warehouse,admin]) {
    for(const sql of ["update public.production_audit set actor_name='forged'",'delete from public.production_audit','insert into public.production_audit default values'])await assert.rejects(asUser(actor,()=>db.exec(sql)),/permission denied/);
    await assert.rejects(asUser(actor,()=>db.query('select private.production_snapshot($1)',[orderId])),/permission denied/);
    await assert.rejects(asUser(actor,()=>db.query("update public.productions set status='active' where id=$1",[orderId])),/permission denied/);
   }
  });
  await t.test('admin can edit and remove another account’s order with the admin actor recorded',async()=>{
   const id=(await save()).rows[0].id;
   await edit(admin,id);await cancel(admin,id,2);
   const events=(await asUser(admin,()=>db.query('select * from public.production_audit where production_id=$1 order by occurred_at',[id]))).rows;
   assert.deepEqual(events.map(event=>event.actor_id),[bakery,admin,admin]);
  });
  await t.test('warehouse registration is guarded, audited, and becomes pending after an edit',async()=>{
   await db.query("update public.products set code='001' where id=$1",[product.id]);
   const id=(await save()).rows[0].id;
   const mark=actor=>asUser(actor,()=>db.query('select public.set_production_registered($1,1,true)',[id]));
   await assert.rejects(mark(bakery),/Warehouse access required/);
   await mark(warehouse);
   for(const actor of [warehouse,admin])await assert.rejects(asUser(actor,()=>db.query('select public.set_production_registered($1,1,false)',[id])),/cannot be removed/);
   const registered=(await asUser(warehouse,()=>db.query('select * from public.productions where id=$1',[id]))).rows[0];
   assert.equal(registered.registered_revision,1);
   const event=(await asUser(admin,()=>db.query("select * from public.production_audit where production_id=$1 and action='registered'",[id]))).rows[0];
   assert.equal(event.actor_id,warehouse);assert.equal(event.after_snapshot.items[0].code,'001');
   await edit(bakery,id);
   const changed=(await asUser(warehouse,()=>db.query('select * from public.productions where id=$1',[id]))).rows[0];
   assert.notEqual(changed.registered_revision,changed.revision);
  });
  await t.test('admin-only catalog writes archive products and preserve order snapshots',async()=>{
   const create=actor=>asUser(actor,()=>db.query("select public.manage_product(null,null,'Q001','Producto de catálogo','kg',false) as id"));
   for(const actor of [bakery,warehouse])await assert.rejects(create(actor),/Admin access required/);
   const id=(await create(admin)).rows[0].id;
   await assert.rejects(create(admin),/duplicate key/);
   const lines=JSON.stringify([{product_id:id,quantity:3}]);
   const order=(await asUser(bakery,()=>db.query("select public.save_production('2026-10-30','María',$1) as id",[lines]))).rows[0].id;
   await asUser(admin,()=>db.query("select public.manage_product($1,1,'Q002','Nuevo nombre','unidades',false)",[id]));
   await asUser(admin,()=>db.query('select public.manage_product($1,2,null,null,null,true)',[id]));
   await assert.rejects(asUser(bakery,()=>db.query("select public.save_production('2026-10-30','María',$1)",[lines])),/Product unavailable/);
   await asUser(bakery,()=>db.query("select public.edit_production($1,1,'2026-10-30','María',$2)",[order,lines]));
   const line=(await db.query('select * from public.production_items where production_id=$1',[order])).rows[0];
   assert.equal(line.name,'Producto de catálogo');assert.equal(line.code,'Q001');assert.equal(line.unit,'kg');
   await assert.rejects(asUser(admin,()=>db.query("select public.manage_product($1,1,'Q003','Otro','kg',false)",[id])),/unavailable|revision/);
  });
 }finally{await db.close();}
});
