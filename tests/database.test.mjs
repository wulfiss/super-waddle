import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Actual PostgreSQL engine, with Supabase's identity roles and auth.uid() simulated.
// Hosted Auth, PostgREST and email delivery still require a remote integration check.
test('production migration, permissions and transactional saves', async t => {
 const db = new PGlite();
 const userA = '11111111-1111-4111-8111-111111111111';
 const userB = '22222222-2222-4222-8222-222222222222';
 try {
  await db.exec(`
   create role anon nologin;
   create role authenticated nologin;
   create schema auth;
   create table auth.users (id uuid primary key);
   create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
   grant usage on schema auth to anon, authenticated;
   grant execute on function auth.uid() to anon, authenticated;
   alter default privileges in schema public grant all on tables to anon, authenticated;
   alter default privileges in schema public grant all on functions to anon, authenticated;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261030112836_initial_production.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8'));
  await db.query('insert into auth.users(id) values ($1), ($2)', [userA, userB]);
  const product = (await db.query("select * from public.products where name='Masa para pizza'")).rows[0];
  const items = [{ product_id: product.id, quantity: 2.5 }];
  const asUser = async (role, uid, fn) => {
   await db.exec('begin');
   try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? '']);
    const result = await fn();
    await db.exec('commit');
    return result;
   } catch (error) { await db.exec('rollback'); throw error; }
  };
  const save = (uid, data = items, responsible = 'María', date = '2026-10-30') =>
   asUser('authenticated', uid, () => db.query(
    'select public.save_production($1::date, $2, $3::jsonb) as id', [date, responsible, JSON.stringify(data)]));
  await t.test('saves fractional quantities and catalog snapshots', async () => {
   await save(userA);
   const row = (await db.query('select * from public.production_items')).rows[0];
   assert.equal(Number(row.quantity), 2.5);
   assert.equal(row.name, product.name);
   assert.equal(row.unit, product.unit);
  });
  await t.test('isolates production history between authenticated users', async () => {
   await save(userB);
   for (const uid of [userA, userB]) {
    await asUser('authenticated', uid, async () => {
     const history = (await db.query('select * from public.productions')).rows;
     assert.equal(history.length, 1);
     assert.equal(history[0].user_id, uid);
     assert.equal((await db.query('select * from public.production_items')).rows.length, 1);
     assert.equal((await db.query('select * from public.products')).rows.length, 6);
    });
   }
  });
  await t.test('denies anonymous data access and saves', async () => {
   for (const table of ['products', 'productions', 'production_items']) {
    await assert.rejects(asUser('anon', null, () => db.query(`select * from public.${table}`)), /permission denied/);
   }
   await assert.rejects(asUser('anon', null, () => db.query(
    'select public.save_production($1::date,$2,$3::jsonb)', ['2026-10-30','María',JSON.stringify(items)])), /permission denied/);
   await assert.rejects(save(null), /Authentication required/);
  });
  await t.test('denies direct writes even with Supabase default grants', async () => {
   for (const table of ['products', 'productions', 'production_items']) {
    await assert.rejects(asUser('authenticated', userA, () => db.query(`delete from public.${table}`)), /permission denied/);
   }
   await assert.rejects(asUser('authenticated', userA, () => db.query(
    'insert into public.productions(user_id,date,responsible) values ($1,$2,$3)', [userB,'2026-10-30','Other user'])), /permission denied/);
  });
  await t.test('rejects invalid requests without leaving partial productions', async () => {
   for (const data of [null, {}, [], [...items, ...items], [{product_id: '00000000-0000-4000-8000-000000000000',quantity:1}],
    ...[0,-1,'NaN','Infinity',null].map(quantity => [{...items[0],quantity}])]) {
    await assert.rejects(save(userA, data));
   }
   for (const responsible of ['', ' ', 'a'.repeat(121), null]) await assert.rejects(save(userA, items, responsible));
   await assert.rejects(save(userA, items, 'María', '2026-02-30'));
   assert.equal((await db.query('select count(*)::int as count from public.productions')).rows[0].count, 2);
   assert.equal((await db.query('select count(*)::int as count from public.production_items')).rows[0].count, 2);
  });
 } finally { await db.close(); }
});
