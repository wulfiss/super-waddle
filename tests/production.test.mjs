import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validate,today} from '../src/lib/production.ts';
const item={product_id:'test',name:'Masa',unit:'kg',quantity:2.5};
test('accepts a production with fractional quantities',()=>assert.equal(validate('2026-10-29','María',[item]),''));
test('rejects missing production information',()=>{
 for(const args of [['','María',[item]],['2026-10-29',' ',[item]],['2026-10-29','María',[]]]) assert.ok(validate(...args));
});
test('rejects zero, negative and non-finite quantities',()=>{
 for(const quantity of [0,-1,NaN,Infinity]) assert.ok(validate('2026-10-29','María',[{...item,quantity}]));
});
test('produces an Argentina calendar date',()=>assert.match(today(),/^\d{4}-\d{2}-\d{2}$/));
test('rejects impossible calendar dates',()=>{
 for(const date of ['2026-02-30','2026-02-29','2026-13-01']) assert.ok(validate(date,'María',[item]));
 assert.equal(validate('2028-02-29','María',[item]),'');
});
test('enforces the database responsible-name limit',()=>assert.ok(validate('2026-10-30','a'.repeat(121),[item])));
