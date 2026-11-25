import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defaultPreviewAccount, findPreviewAccount, previewAccounts, previewHistory } from '../src/lib/preview-accounts.ts';

test('preview accounts preserve ownership while warehouse and admin see all test orders', () => {
 const records = [{ id:'bakery-order',user_id:'preview-bakery' }, { id:'admin-order',user_id:'preview-admin' }, { id:'legacy-order' }];
 assert.deepEqual(previewHistory(records, defaultPreviewAccount).map(record=>record.id), ['bakery-order','legacy-order']);
 for (const account of previewAccounts.filter(account=>account.role!=='bakery')) assert.equal(previewHistory(records,account).length,3);
 assert.equal(findPreviewAccount('preview-admin')?.role,'admin');
 assert.equal(findPreviewAccount('__proto__'),undefined);
});

test('only the designated feature preview can build without a Supabase backend', () => {
 const script=fileURLToPath(new URL('../scripts/check-production-env.mjs',import.meta.url));
 const check=env=>spawnSync(process.execPath,[script],{env,encoding:'utf8'});
 const demo={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feature/registro-rapido-ui'};
 assert.equal(check(demo).status,0);
 assert.equal(check({...demo,VERCEL_ENV:'production'}).status,1);
 assert.equal(check({...demo,VERCEL_GIT_COMMIT_REF:'another-branch'}).status,1);
 assert.equal(check({...demo,PUBLIC_PREVIEW_MODE:'true'}).status,1);
 for (const environment of ['production','preview','development','']) {
  const result=check({PUBLIC_PREVIEW_MODE:'true',VERCEL_ENV:environment});
  assert.equal(result.status,1);
  assert.match(result.stderr,/local development server only and cannot be deployed/);
 }
 const preview=check({PUBLIC_PREVIEW_MODE:'false',VERCEL_ENV:'preview',PUBLIC_SUPABASE_URL:'https://example.supabase.co',PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'});
 assert.equal(preview.status,0);
});
