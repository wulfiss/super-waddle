import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {orderWorkbook,isRegistered} from '../src/lib/warehouse.ts';
import {changePreviewOrder} from '../src/lib/order-history.ts';
import {defaultPreviewAccount,findPreviewAccount} from '../src/lib/preview-accounts.ts';
test('registration is warehouse-only, audited and invalidated by bakery edits',()=>{
 const draft={date:'2026-10-30',responsible:'María',items:[{product_id:'pan',code:'001',name:'Pan',unit:'kg',quantity:2.5}]};
 const initial=changePreviewOrder({orders:[],audit:[]},defaultPreviewAccount,{action:'created',draft});
 const id=initial.orders[0].id;
 assert.throws(()=>changePreviewOrder(initial,defaultPreviewAccount,{action:'registered',id,revision:1}),/access required/);
 const marked=changePreviewOrder(initial,findPreviewAccount('preview-warehouse'),{action:'registered',id,revision:1});
 assert.equal(isRegistered(marked.orders[0]),true);assert.equal(marked.audit[0].actor_role,'warehouse');
 const edited=changePreviewOrder(marked,defaultPreviewAccount,{action:'edited',id,revision:1,draft});
 assert.equal(isRegistered(edited.orders[0]),false);
});
test('Excel download is a genuine workbook with text codes and numeric quantities',async()=>{
 const bytes=await orderWorkbook({id:'order-test',date:'2026-10-30',responsible:'María',registered_revision:1,items:[{product_id:'p',code:'001',name:'=PRODUCTO',quantity:2.5,unit:'kg'}]});
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);
 const sheet=workbook.worksheets[0];assert.equal(sheet.getCell('A8').value,'001');assert.equal(sheet.getCell('B8').value,'=PRODUCTO');assert.equal(sheet.getCell('C8').value,2.5);assert.equal(sheet.getCell('B4').value,'Registrado');
});
