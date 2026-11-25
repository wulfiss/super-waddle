import {openField,chooseIngredient,correctField} from './helpers/formulation-fields.mjs';
import {test,expect} from '@playwright/test';
import {clickSidebar} from './helpers/sidebar.mjs';
async function open(page){
 await page.goto('/');await page.getByLabel('Cuenta de prueba').selectOption('preview-admin');await clickSidebar(page,'Recetas');await page.getByRole('button',{name:'Aprobar versión',exact:true}).click();await page.getByRole('button',{name:'Sí, aprobar versión',exact:true}).click();await expect(page.getByRole('article')).toContainText('Vigente');
 await page.getByLabel('Cuenta de prueba').selectOption('preview-bakery');await clickSidebar(page,'Elaboraciones');const id=await page.locator('#batch-recipe option').nth(1).getAttribute('value');await page.getByLabel('Receta vigente',{exact:true}).selectOption(id);await page.getByLabel('Responsable de elaboración',{exact:true}).fill('Entrada rápida');await chooseIngredient(page,1,1);await chooseIngredient(page,6,0);await openField(page,'Peso real de Harina 000 Lealtad');
}
async function fill(page){for(const [name,value]of [['Harina 000 Lealtad','25'],['Agua','31'],['Sal fina Dos Anclas','1'],['Levadura virgen','250'],['Mejorador Fórmula 1','300']])await (await openField(page,'Peso real de '+name)).fill(value);}
async function confirmBatch(page){
 const dialog=page.getByRole('dialog',{name:'Revisá tu elaboración'});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Sí, guardar elaboración'}).click();
}
test('weights appear on product selection and confirmation saves all ingredients',async({page})=>{
 await open(page);await expect(page.getByLabel('Peso real de Harina 000 Lealtad',{exact:true})).toBeVisible();await expect(page.getByLabel('Peso real de Agua',{exact:true})).not.toBeVisible();await expect(page.getByRole('button',{name:'Iniciar elaboración',exact:true})).not.toBeVisible();await expect(page.getByRole('button',{name:'Registrar peso',exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Lote 1',{exact:true})).toBeVisible();await expect(page.getByLabel('Vencimiento 1',{exact:true})).toBeVisible();await page.getByLabel('Lote 1',{exact:true}).fill('LOT-COMPACT');await page.getByLabel('Vencimiento 1',{exact:true}).fill('2027-01-31');
 await fill(page);await page.getByRole('button',{name:'Guardar elaboración',exact:true}).click();await confirmBatch(page);await expect(page.getByRole('status')).toContainText('guardada y confirmada');await expect(page.getByRole('article')).toHaveCount(0);await expect(page.getByRole('region',{name:'Historial de elaboraciones',exact:true})).toHaveCount(0);
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('picui-preview-batches-v1')));expect(stored).toHaveLength(1);expect(stored[0].status).toBe('closed');expect(stored[0].weighings).toHaveLength(5);expect(stored[0].weighings.every(w=>w.incorporated)).toBe(true);expect(stored[0].has_discrepancies).toBe(true);expect(stored[0].weighings.find(w=>w.ingredient_id==='harina').lot).toBe('LOT-COMPACT');expect(stored[0].weighings.find(w=>w.ingredient_id==='harina').expiry_date).toBe('2027-01-31');
 await clickSidebar(page,'Historial');
 const orders = page.getByRole('tab',{name:'Pedidos',exact:true});
 await expect(orders).toHaveAttribute('aria-selected','true');
 await orders.press('ArrowRight');
 const history = page.getByRole('region',{name:'Historial de elaboraciones'});
 const search = page.getByRole('searchbox',{name:'Buscar por receta o responsable'});
 for(const query of ['pan mignon','entrada rapida']){
  await search.fill(query);
  await expect(history.getByRole('article')).toHaveCount(1);
  await expect(history.getByRole('row',{name:'Agua 30 L 31 L',exact:true})).toBeVisible();
 }
 await search.fill('sin coincidencias');
 await expect(history.getByRole('status')).toContainText('No hay elaboraciones que coincidan');
 await expect(history.getByRole('article')).toHaveCount(0);
 await search.fill('');
 await expect(history.getByRole('article')).toContainText('Confirmada');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await page.reload();await clickSidebar(page,'Elaboraciones');await expect(page.getByRole('article')).toHaveCount(0);await page.getByLabel('Cuenta de prueba').selectOption('preview-admin');await clickSidebar(page,'Historial de elaboraciones');
 await expect(page.getByRole('heading',{name:'Historial de elaboraciones',exact:true})).toBeVisible();
 await expect(page.getByRole('form',{name:'Nueva elaboración'})).toHaveCount(0);
 await search.fill('sin coincidencias');
 await expect(history.getByRole('article')).toHaveCount(0);
 await search.fill('entrada rapida');
 await expect(history.getByRole('row',{name:'Agua 30 L 31 L',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('picui-preview-batches-v1')))).toEqual(stored);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
test('missing weights create nothing and a lost acknowledgement retries without duplicates',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Guardar elaboración',exact:true}).click();await correctField(page,/peso real de Harina/,page.getByLabel('Peso real de Harina 000 Lealtad',{exact:true}));expect(await page.evaluate(()=>localStorage.getItem('picui-preview-batches-v1'))).toBeNull();await fill(page);
 await page.evaluate(()=>{const original=Storage.prototype.setItem;let failed=false;Storage.prototype.setItem=function(key,value){original.call(this,key,value);if(key==='picui-preview-batches-v1'&&!failed){failed=true;throw new Error('Respuesta perdida');}};});
 await page.getByRole('button',{name:'Guardar elaboración',exact:true}).click();await confirmBatch(page);await expect(page.getByRole('alert')).toContainText('Respuesta perdida');await expect(page.getByLabel('Peso real de Agua',{exact:true})).toHaveValue('31');
 await page.getByRole('button',{name:'Guardar elaboración',exact:true}).click();await confirmBatch(page);await expect(page.getByRole('status')).toContainText('guardada y confirmada');
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('picui-preview-batches-v1')));expect(stored).toHaveLength(1);expect(stored[0].events.filter(e=>e.action==='weight_saved')).toHaveLength(5);
});

test('ingredient cards keep manual weights and preview discrepancies',async({page})=>{
 await open(page);const flour=page.locator('details[data-ingredient="harina"]');for(let index=0;index<4;index++){await page.locator('details[data-ingredient="agua"] > summary').click();await flour.locator(':scope > summary').click();}await expect(flour).toHaveAttribute('open','');await expect(page.getByLabel('Peso real de Harina 000 Lealtad',{exact:true})).toHaveValue('');
 await expect(flour.getByRole('button',{name:/Usar sugerido/i})).toHaveCount(0);
 await page.getByLabel('Lote 1',{exact:true}).fill('L-GUIDED');
 await page.getByLabel('Peso real de Harina 000 Lealtad',{exact:true}).fill('25');
 await flour.getByRole('button',{name:'Siguiente →',exact:true}).click();
 expect(await page.evaluate(()=>localStorage.getItem('picui-preview-batches-v1'))).toBeNull();

 await expect(page.getByLabel('Peso real de Agua',{exact:true})).toBeVisible();await page.getByLabel('Peso real de Agua',{exact:true}).fill('40');
 await expect(page.getByRole('dialog',{name:'Revisá tu elaboración'})).toBeHidden();
 await expect(page.locator('details[data-ingredient="agua"] .difference')).toContainText('33,33 %');
 await openField(page,'Peso real de Harina 000 Lealtad');await expect(page.getByLabel('Lote 1',{exact:true})).toHaveValue('L-GUIDED');await expect(page.getByLabel('Peso real de Harina 000 Lealtad',{exact:true})).toHaveValue('25');await expect(page.locator('details[data-ingredient][open]')).toHaveCount(1);
});


test('manual weights advance to the next ingredient, summary edits focus the weight, and only the final action saves',async({page})=>{
 await open(page);
 const flour=page.locator('details[data-ingredient="harina"]');
 await flour.getByRole('button',{name:'Siguiente →',exact:true}).click();await correctField(page,/peso real de Harina/,page.getByLabel('Peso real de Harina 000 Lealtad',{exact:true}));
 await page.getByLabel('Cantidad',{exact:true}).fill('0,0001');await page.getByRole('button',{name:'Guardar elaboración',exact:true}).click();await correctField(page,/cantidad entre/,page.getByLabel('Cantidad',{exact:true}));await expect(page.getByLabel('Peso real de Harina 000 Lealtad',{exact:true})).toHaveValue('');await page.getByLabel('Cantidad',{exact:true}).fill('1');
 await page.getByLabel('Lote 1',{exact:true}).fill('LOT-FAST');await page.getByLabel('Vencimiento 1',{exact:true}).fill('2027-01-31');
 for(const [id,value,next] of [
  ['harina','25','Agua'], ['agua','30','Sal fina Dos Anclas'],
  ['sal','1','Levadura virgen'], ['levadura','250','Mejorador Fórmula 1'], ['mejorador','300',null]
 ]){
  const panel=page.locator(`details[data-ingredient="${id}"]`);
  const weight=panel.getByRole('textbox',{name:/^Peso real de /});
  await expect(weight).toHaveValue('');
  await weight.fill(value);
  await panel.getByRole('button',{name:'Siguiente →',exact:true}).click();
  if(next)await expect(page.getByLabel('Peso real de '+next,{exact:true})).toBeFocused();
 }
 await expect(page.getByRole('button',{name:'Guardar elaboración',exact:true})).toBeFocused();expect(await page.evaluate(()=>localStorage.getItem('picui-preview-batches-v1'))).toBeNull();
 const save=page.getByRole('button',{name:'Guardar elaboración',exact:true});
 const dialog=page.getByRole('dialog',{name:'Revisá tu elaboración'});
 await save.click();
 await expect(dialog).toContainText('30 / 30 L');
 expect(await page.evaluate(()=>localStorage.getItem('picui-preview-batches-v1'))).toBeNull();
 await dialog.getByRole('button',{name:'Volver a editar'}).click();
 await expect(save).toBeFocused();
 await save.click();
 await page.keyboard.press('Escape');
 await expect(dialog).toBeHidden();
 await save.click();
 await page.getByRole('button',{name:'Editar peso de Agua',exact:true}).click();const water=page.getByLabel('Peso real de Agua',{exact:true});await expect(water).toBeFocused();await water.fill('31');await water.press('Enter');await expect(page.getByLabel('Peso real de Sal fina Dos Anclas',{exact:true})).toBeFocused();
 await save.click();
 await expect(dialog).toContainText('31 / 30 L');
 await expect(dialog).toContainText('+3,33 %');
 await confirmBatch(page);await expect(page.getByRole('status')).toContainText('guardada y confirmada');
 const [saved]=await page.evaluate(()=>JSON.parse(localStorage.getItem('picui-preview-batches-v1')));expect(saved.status).toBe('closed');expect(saved.weighings).toHaveLength(5);expect(saved.weighings.find(w=>w.ingredient_id==='harina').lot).toBe('LOT-FAST');expect(saved.weighings.find(w=>w.ingredient_id==='harina').expiry_date).toBe('2027-01-31');expect(saved.weighings.find(w=>w.ingredient_id==='agua').actual_quantity).toBe(31);
});

test('split brands keep separate traceability and use one ingredient total',async({page})=>{
 await open(page);
 await fill(page);
 const water=page.locator('details[data-ingredient="agua"]');
 await openField(page,'Peso real de Agua');
 await water.getByRole('button',{name:'Combinar marcas'}).click();
 const first=water.getByRole('group',{name:'Marca 1',exact:true});
 const second=water.getByRole('group',{name:'Marca 2',exact:true});
 await first.getByLabel('Cantidad (L)').fill('10,5');
 await first.getByLabel('Lote').fill('A');
 await first.getByLabel('Vencimiento').fill('2027-01-01');
 await second.getByLabel('Marca',{exact:true}).fill('Proveedor nuevo');
 await expect(second.getByRole('button',{name:/restantes/i})).toHaveCount(0);
 await expect(second.getByLabel('Cantidad (L)')).toHaveValue('');
 await second.getByLabel('Cantidad (L)').fill('18,5');
 await second.getByLabel('Lote').fill('B');
 await water.getByRole('button',{name:'Siguiente →'}).click();
 await correctField(page,'Elegí el vencimiento de Proveedor nuevo.',second.getByLabel('Vencimiento'));
 await second.getByLabel('Vencimiento').fill('2027-02-01');
 await expect(water).toContainText('Total: 29 L');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await page.getByRole('button',{name:'Guardar elaboración'}).click();
 await confirmBatch(page);
 await expect(page.getByRole('status')).toContainText('guardada y confirmada');
 const row=await page.evaluate(()=>JSON.parse(localStorage.getItem('picui-preview-batches-v1'))[0].weighings.find(w=>w.ingredient_id==='agua'));
 expect(row.actual_quantity).toBe(29);
 expect(row.brands).toEqual([{name:'Agua',actual_quantity:10.5,lot:'A',expiry_date:'2027-01-01'},
  {name:'Proveedor nuevo',actual_quantity:18.5,lot:'B',expiry_date:'2027-02-01'}]);
});

test('a new single brand can be started, resumed and updated without entering lot or expiry', async({page})=>{
 await open(page);
 const flour=page.locator('details[data-ingredient="harina"]');
 await flour.getByRole('button',{name:'Otra marca',exact:true}).click();
 const custom=flour.getByRole('group',{name:'Marca 1',exact:true});
 await custom.getByLabel('Marca',{exact:true}).fill('Molino del Sur');
 await expect(custom.getByRole('button',{name:/sugeridos/i})).toHaveCount(0);
 await expect(custom.getByLabel('Cantidad (kg)')).toHaveValue('');
 await custom.getByLabel('Cantidad (kg)').fill('24');
 await page.getByText('Más opciones',{exact:true}).click();
 await page.getByText('Continuar más tarde (opcional)',{exact:true}).click();
 await page.getByRole('button',{name:'Iniciar elaboración',exact:true}).click();
 const batch=page.getByRole('article');
 const saved=batch.getByRole('group',{name:'Marca 1',exact:true});
 await expect(saved.getByLabel('Marca',{exact:true})).toHaveValue('Molino del Sur');
 await expect(saved.getByLabel('Cantidad (kg)')).toHaveValue('24');
 await saved.getByLabel('Cantidad (kg)').fill('24,5');
 await batch.getByRole('button',{name:'Guardar cambios de peso',exact:true}).click();
 await expect(batch.getByText('Peso registrado.',{exact:true})).toBeVisible();
 await batch.getByRole('button',{name:'Confirmar incorporación',exact:true}).click();
 await expect(saved.getByLabel('Marca',{exact:true})).toHaveAttribute('readonly','');
 const [record]=await page.evaluate(()=>JSON.parse(localStorage.getItem('picui-preview-batches-v1')));
 expect(record.weighings[0].brands).toEqual([{name:'Molino del Sur',actual_quantity:24.5,lot:null,expiry_date:null}]);
});

test('saving from the bottom reveals the missing field without losing the draft',async({page})=>{
 await open(page);
 const water=await openField(page,'Peso real de Agua');
 await water.fill('31');
 const responsible=page.getByLabel('Responsable de elaboración');
 await responsible.fill(' ');
 const save=page.getByRole('button',{name:'Guardar elaboración'});
 await save.click();
 await correctField(page,'Escribí el nombre del responsable.',responsible);
 await responsible.fill('Turno tarde');
 await save.click();
 const flour=page.getByLabel('Peso real de Harina 000 Lealtad',{exact:true});
 const notice=page.getByRole('alertdialog');
 await expect(notice).toBeInViewport();
 await page.keyboard.press('Escape');
 await expect(flour).toBeFocused();
 await expect(flour).toBeInViewport();
 await expect(water).toHaveValue('31');
 expect(await page.evaluate(()=>localStorage.getItem('picui-preview-batches-v1'))).toBeNull();
});
