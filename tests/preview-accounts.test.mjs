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

test('no-login accounts are allowed in preview builds and refused in production builds', () => {
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
 for (const environment of ['production','development','']) {
  const result=check({PUBLIC_PREVIEW_MODE:'true',VERCEL_ENV:environment});
  assert.equal(result.status,1);
  assert.match(result.stderr,/only be deployed to the preview environment/);
 }
 const preview=check({PUBLIC_PREVIEW_MODE:'true',VERCEL_ENV:'preview',PUBLIC_SUPABASE_URL:'',PUBLIC_SUPABASE_PUBLISHABLE_KEY:''});
 assert.equal(preview.status,0);
});
