import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {orderWorkbook,isRegistered} from '../src/lib/warehouse.ts';
import {changePreviewOrder} from '../src/lib/order-history.ts';
import {defaultPreviewAccount,findPreviewAccount} from '../src/lib/preview-accounts.ts';
test('registration is warehouse-only, audited and locks bakery edits',()=>{
 const draft={date:'2026-10-30',items:[{product_id:'pan',code:'001',name:'Pan',unit:'kg',quantity:2.5}]};
 const initial=changePreviewOrder({orders:[],audit:[]},defaultPreviewAccount,{action:'created',draft});
 const id=initial.orders[0].id;
 assert.throws(()=>changePreviewOrder(initial,defaultPreviewAccount,{action:'registered',id,revision:1}),/access required/);
 const marked=changePreviewOrder(initial,findPreviewAccount('preview-warehouse'),{action:'registered',id,revision:1});
 assert.equal(isRegistered(marked.orders[0]),true);assert.equal(marked.audit[0].actor_role,'warehouse');
 for(const actor of [findPreviewAccount('preview-warehouse'),findPreviewAccount('preview-admin')])assert.throws(()=>changePreviewOrder(marked,actor,{action:'unregistered',id,revision:1}),/cannot be removed/);
 assert.equal(changePreviewOrder(marked,findPreviewAccount('preview-warehouse'),{action:'registered',id,revision:1}),marked);
 assert.throws(()=>changePreviewOrder(marked,defaultPreviewAccount,{action:'edited',id,revision:1,draft}),/already registered/);
 assert.equal(isRegistered(marked.orders[0]),true);
});
test('Excel groups both product categories, with text codes and numeric quantities',async()=>{
 const items=[
  {product_id:'s',code:'002',name:'Manga',quantity:1,unit:'unidades',category:'insumos'},
  {product_id:'p',code:'001',name:'=PRODUCTO',quantity:2.5,unit:'kg'}
 ];
 const bytes=await orderWorkbook({id:'order-test',date:'2026-10-30',responsible:'María',registered_revision:1,items});
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);
 const sheet=workbook.worksheets[0];
 assert.equal(sheet.getCell('B3').value,'María');assert.equal(sheet.getCell('B4').value,'Registrado');
 assert.equal(sheet.getCell('A7').value,'Materia prima');
 assert.deepEqual(sheet.getRow(9).values.slice(1),['001','=PRODUCTO',2.5,'kg']);
 assert.equal(sheet.getCell('A11').value,'Insumos');
 assert.deepEqual(sheet.getRow(13).values.slice(1),['002','Manga',1,'unidades']);
});
