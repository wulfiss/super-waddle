import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { defaultPreviewAccount, findPreviewAccount, previewAccounts, previewHistory } from '../src/lib/preview-accounts.ts';

test('preview accounts preserve ownership while warehouse and admin see all test orders', () => {
 const records = [{ id:'bakery-order',user_id:'preview-bakery' }, { id:'admin-order',user_id:'preview-admin' }, { id:'legacy-order' }];
 assert.deepEqual(previewHistory(records, defaultPreviewAccount).map(record=>record.id), ['bakery-order','legacy-order']);
 for (const account of previewAccounts.filter(account=>account.role!=='bakery')) assert.equal(previewHistory(records,account).length,3);
 assert.equal(findPreviewAccount('preview-admin')?.role,'admin');
 assert.equal(findPreviewAccount('__proto__'),undefined);
});

test('deployed builds always require real login and cannot enable local test accounts', () => {
 const source=readFileSync(new URL('../scripts/check-production-env.mjs',import.meta.url),'utf8');
 function check(env) {
  const result={status:0,stderr:''};
  const exited=Symbol('process.exit');
  try {
   runInNewContext(source,{
    process:{env,exit(status){result.status=status;throw exited;}},
    console:{log(){},error(message){result.stderr+=message;}},URL,Buffer
   });
  } catch(error) {if(error!==exited)throw error;}
  return result;
 }
 for (const environment of ['production','preview','development','']) {
  const result=check({PUBLIC_PREVIEW_MODE:'true',VERCEL_ENV:environment});
  assert.equal(result.status,1);
  assert.match(result.stderr,/local development server only and cannot be deployed/);
 }
 const preview=check({PUBLIC_PREVIEW_MODE:'false',VERCEL_ENV:'preview',PUBLIC_SUPABASE_URL:'https://example.supabase.co',PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'});
 assert.equal(preview.status,0);
});
