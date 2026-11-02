import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changePreviewOrder, describeChanges } from '../src/lib/order-history.ts';
import { defaultPreviewAccount, findPreviewAccount, previewHistory } from '../src/lib/preview-accounts.ts';

const bakery=defaultPreviewAccount;
const warehouse=findPreviewAccount('preview-warehouse');
const admin=findPreviewAccount('preview-admin');
const draft={date:'2026-10-30',responsible:'María',items:[{product_id:'pan',name:'Pan',unit:'kg',quantity:2}]};

test('edits and removals reach warehouse while preserving actor and before/after audit snapshots', () => {
 const created=changePreviewOrder({orders:[],audit:[]},bakery,{action:'created',draft});
 const id=created.orders[0].id;
 const edited=changePreviewOrder(created,bakery,{action:'edited',id,revision:1,draft:{...draft,responsible:'Juan',items:[{...draft.items[0],quantity:4}]}});
 assert.equal(edited.orders.length,1);
 assert.equal(previewHistory(edited.orders,warehouse)[0].items[0].quantity,4);
 const event=edited.audit[0];
 assert.equal(event.actor_name,bakery.name);
 assert.equal(event.before_snapshot.responsible,'María');
 assert.equal(event.before_snapshot.items[0].quantity,2);
 assert.equal(event.after_snapshot.items[0].quantity,4);
 assert.deepEqual(describeChanges(event),['Responsable: María → Juan','Pan: 2 kg → 4 kg']);
 assert.equal(created.orders[0].items[0].quantity,2);
 const removed=changePreviewOrder(edited,bakery,{action:'cancelled',id,revision:2});
 assert.equal(previewHistory(removed.orders,warehouse).length,0);
 assert.equal(previewHistory(removed.orders,bakery).length,0);
 assert.equal(removed.orders.length,1);
 assert.deepEqual(removed.audit.map(entry=>entry.action),['cancelled','edited','created']);
 assert.equal(removed.audit[0].before_snapshot.items[0].quantity,4);
 assert.equal(removed.audit[0].after_snapshot.status,'cancelled');
 removed.orders[0].items[0].quantity=99;
 assert.equal(removed.audit[0].after_snapshot.items[0].quantity,4);
 assert.equal(removed.audit[1].after_snapshot.items[0].quantity,4);
});

test('rejects warehouse writes, other owners, stale revisions and invalid edits without mutation', () => {
 const created=changePreviewOrder({orders:[],audit:[]},admin,{action:'created',draft});
 const id=created.orders[0].id;
 const initial=JSON.stringify(created);
 assert.throws(()=>changePreviewOrder(created,warehouse,{action:'cancelled',id,revision:1}),/access required/);
 assert.throws(()=>changePreviewOrder(created,bakery,{action:'cancelled',id,revision:1}),/unavailable/);
 assert.throws(()=>changePreviewOrder(created,admin,{action:'cancelled',id,revision:0}),/revision/);
 assert.throws(()=>changePreviewOrder(created,admin,{action:'edited',id,revision:1,draft:{...draft,items:[]}}));
 assert.equal(JSON.stringify(created),initial);
});

test('admin edits of legacy bakery orders preserve their original owner', () => {
 const legacy={orders:[{id:'old',...draft}],audit:[]};
 const edited=changePreviewOrder(legacy,admin,{action:'edited',id:'old',revision:1,draft});
 assert.equal(edited.orders[0].user_id,bakery.id);
 assert.equal(previewHistory(edited.orders,bakery).length,1);
});
