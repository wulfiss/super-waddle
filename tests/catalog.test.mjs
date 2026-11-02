import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeCatalog,catalogItems} from '../src/lib/catalog.ts';
test('only admins manage unique, versioned products without destroying historical snapshots',()=>{
 const draft={code:'001',name:'Pan especial',unit:'kg'};
 for(const role of ['bakery','warehouse',null])assert.throws(()=>changeCatalog([],role,{action:'save',draft}),/administración/);
 const catalog=changeCatalog([],'admin',{action:'save',draft});
 const id=catalog[0].id;
 assert.throws(()=>changeCatalog(catalog,'admin',{action:'save',draft}),/Ya existe/);
 assert.throws(()=>changeCatalog(catalog,'admin',{action:'remove',id,revision:0}),/cambió/);
 const items=catalogItems([{product_id:id,quantity:2}],catalog);
 const edited=changeCatalog(catalog,'admin',{action:'save',id,revision:1,draft:{code:'002',name:'Otro nombre',unit:'unidades'}});
 assert.deepEqual(catalogItems(items,edited,items),items);
 const removed=changeCatalog(edited,'admin',{action:'remove',id,revision:2});
 assert.equal(removed[0].active,false);assert.deepEqual(catalogItems(items,removed,items),items);
 assert.throws(()=>catalogItems(items,removed),/ya no está disponible/);
});
