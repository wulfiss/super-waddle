import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAccess, homeScreen, screensFor } from '../src/lib/access.ts';

test('staff only access their assigned screen; administrators access every screen', () => {
 assert.deepEqual(screensFor('bakery'), ['bakery']);
 assert.deepEqual(screensFor('warehouse'), ['warehouse']);
 assert.deepEqual(screensFor('admin'), ['bakery', 'warehouse', 'admin']);
 assert.equal(canAccess('warehouse', 'bakery'), false);
 assert.equal(canAccess('bakery', 'admin'), false);
 assert.equal(homeScreen('warehouse'), 'warehouse');
 assert.equal(homeScreen('admin'), 'admin');
});

test('missing, invalid and inherited-property role names never receive permissions', () => {
 for (const value of [null, undefined, '', 'owner', 'toString', '__proto__', {}, ['admin']]) {
  assert.deepEqual(screensFor(value), []);
  for (const screen of ['bakery', 'warehouse', 'admin']) assert.equal(canAccess(value, screen), false);
 }
});
