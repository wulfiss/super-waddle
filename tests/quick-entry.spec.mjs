import {openField,chooseIngredient} from './helpers/formulation-fields.mjs';
import {test,expect} from '@playwright/test';
import {clickSidebar} from './helpers/sidebar.mjs';
async function open(page){
 await page.goto('/');await page.getByLabel('Cuenta de prueba').selectOption('preview-admin');await clickSidebar(page,'Recetas');await page.getByRole('button',{name:'Aprobar versión',exact:true}).click();await page.getByRole('button',{name:'Sí, aprobar versión',exact:true}).click();await expect(page.getByRole('article')).toContainText('Vigente');
 await page.getByLabel('Cuenta de prueba').selectOption('preview-bakery');await clickSidebar(page,'Elaboraciones');const id=await page.locator('#batch-recipe option').nth(1).getAttribute('value');await page.getByLabel('Receta vigente',{exact:true}).selectOption(id);await page.getByLabel('Responsable de elaboración',{exact:true}).fill('Entrada rápida');await chooseIngredient(page,1,1);await chooseIngredient(page,6,0);await openField(page,'Peso real de Harina 000 Lealtad');
}
async function fill(page){for(const [name,value]of [['Harina 000 Lealtad','25'],['Agua','31'],['Sal fina Dos Anclas','1'],['Levadura virgen','250'],['Mejorador Fórmula 1','300']])await (await openField(page,'Peso real de '+name)).fill(value);}
test('weights appear on product selection and one action saves and confirms all ingredients',async({page})=>{
 await open(page);await expect(page.getByLabel('Peso real de Harina 000 Lealtad',{exact:true})).toBeVisible();await expect(page.getByLabel('Peso real de Agua',{exact:true})).not.toBeVisible();await expect(page.getByRole('button',{name:'Iniciar elaboración',exact:true})).not.toBeVisible();await expect(page.getByRole('button',{name:'Registrar peso',exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Lote 1',{exact:true})).toBeVisible();await expect(page.getByLabel('Vencimiento 1',{exact:true})).toBeVisible();await page.getByLabel('Lote 1',{exact:true}).fill('LOT-COMPACT');await page.getByLabel('Vencimiento 1',{exact:true}).fill('2027-01-31');
 await fill(page);await page.getByRole('button',{name:'Guardar y confirmar elaboración',exact:true}).click();await expect(page.getByRole('status')).toContainText('guardada y confirmada');await expect(page.getByRole('article')).toHaveCount(0);await expect(page.getByRole('region',{name:'Historial de elaboraciones',exact:true})).toHaveCount(0);
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('picui-preview-batches-v1')));expect(stored).toHaveLength(1);expect(stored[0].status).toBe('closed');expect(stored[0].weighings).toHaveLength(5);expect(stored[0].weighings.every(w=>w.incorporated)).toBe(true);expect(stored[0].has_discrepancies).toBe(true);expect(stored[0].weighings.find(w=>w.ingredient_id==='harina').lot).toBe('LOT-COMPACT');expect(stored[0].weighings.find(w=>w.ingredient_id==='harina').expiry_date).toBe('2027-01-31');
 await page.reload();await clickSidebar(page,'Elaboraciones');await expect(page.getByRole('article')).toHaveCount(0);await page.getByLabel('Cuenta de prueba').selectOption('preview-admin');await clickSidebar(page,'Elaboraciones');await expect(page.getByRole('article')).toHaveCount(0);await expect(page.getByText('Todas las elaboraciones',{exact:true})).toHaveCount(0);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('picui-preview-batches-v1')))).toEqual(stored);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
test('missing weights create nothing and a lost acknowledgement retries without duplicates',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Guardar y confirmar elaboración',exact:true}).click();await expect(page.getByRole('alert')).toContainText('peso real');expect(await page.evaluate(()=>localStorage.getItem('picui-preview-batches-v1'))).toBeNull();await fill(page);
 await page.evaluate(()=>{const original=Storage.prototype.setItem;let failed=false;Storage.prototype.setItem=function(key,value){original.call(this,key,value);if(key==='picui-preview-batches-v1'&&!failed){failed=true;throw new Error('Respuesta perdida');}};});
 await page.getByRole('button',{name:'Guardar y confirmar elaboración',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Respuesta perdida');await expect(page.getByLabel('Peso real de Agua',{exact:true})).toHaveValue('31');
 await page.getByRole('button',{name:'Guardar y confirmar elaboración',exact:true}).click();await expect(page.getByRole('status')).toContainText('guardada y confirmada');
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('picui-preview-batches-v1')));expect(stored).toHaveLength(1);expect(stored[0].events.filter(e=>e.action==='weight_saved')).toHaveLength(5);
});

test('ingredient cards keep entered values, fill suggestions only on request, and preview discrepancies',async({page})=>{
 await open(page);const flour=page.locator('details[data-ingredient="harina"]');for(let index=0;index<4;index++){await page.locator('details[data-ingredient="agua"] > summary').click();await flour.locator(':scope > summary').click();}await expect(flour).toHaveAttribute('open','');await expect(page.getByLabel('Peso real de Harina 000 Lealtad',{exact:true})).toHaveValue('');
 await page.getByLabel('Lote 1',{exact:true}).fill('L-GUIDED');await flour.getByRole('button',{name:'Usar sugerido y seguir',exact:true}).click();await expect(page.getByLabel('Peso real de Harina 000 Lealtad',{exact:true})).toHaveValue('25');
 expect(await page.evaluate(()=>localStorage.getItem('picui-preview-batches-v1'))).toBeNull();

 await expect(page.getByLabel('Peso real de Agua',{exact:true})).toBeVisible();await page.getByLabel('Peso real de Agua',{exact:true}).fill('40');
 const summary=page.getByRole('region',{name:'Resumen de elaboración',exact:true});await expect(summary).toContainText('40 / 30 L');await expect(summary).toContainText('+33,33 %');
 await openField(page,'Peso real de Harina 000 Lealtad');await expect(page.getByLabel('Lote 1',{exact:true})).toHaveValue('L-GUIDED');await expect(page.getByLabel('Peso real de Harina 000 Lealtad',{exact:true})).toHaveValue('25');await expect(page.locator('details[data-ingredient][open]')).toHaveCount(1);
});


test('suggested weights advance in one tap, summary edits focus the weight, and only the final action saves',async({page})=>{
 await open(page);
 const flour=page.locator('details[data-ingredient="harina"]');
 await flour.getByRole('button',{name:'Siguiente →',exact:true}).click();await expect(page.getByRole('alert')).toContainText('peso');await expect(page.getByLabel('Peso real de Harina 000 Lealtad',{exact:true})).toBeFocused();
 await page.getByLabel('Cantidad',{exact:true}).fill('0,0001');await flour.getByRole('button',{name:'Usar sugerido y seguir',exact:true}).click();await expect(page.getByLabel('Cantidad',{exact:true})).toBeFocused();await expect(page.getByLabel('Peso real de Harina 000 Lealtad',{exact:true})).toHaveValue('');await page.getByLabel('Cantidad',{exact:true}).fill('1');
 await page.getByLabel('Lote 1',{exact:true}).fill('LOT-FAST');await page.getByLabel('Vencimiento 1',{exact:true}).fill('2027-01-31');
 for(const [id,next]of [['harina','Agua'],['agua','Sal fina Dos Anclas'],['sal','Levadura virgen'],['levadura','Mejorador Fórmula 1'],['mejorador',null]]){
  await page.locator(`details[data-ingredient="${id}"]`).getByRole('button',{name:'Usar sugerido y seguir',exact:true}).click();
  if(next)await expect(page.getByLabel('Peso real de '+next,{exact:true})).toBeFocused();
 }
 await expect(page.getByRole('button',{name:'Guardar y confirmar elaboración',exact:true})).toBeFocused();expect(await page.evaluate(()=>localStorage.getItem('picui-preview-batches-v1'))).toBeNull();
 await page.getByRole('button',{name:'Editar peso de Agua',exact:true}).click();const water=page.getByLabel('Peso real de Agua',{exact:true});await expect(water).toBeFocused();await water.fill('31');await water.press('Enter');await expect(page.getByLabel('Peso real de Sal fina Dos Anclas',{exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Guardar y confirmar elaboración',exact:true}).click();await expect(page.getByRole('status')).toContainText('guardada y confirmada');
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
 await second.getByRole('button',{name:'Usar 19,5 L restantes'}).click();
 await expect(second.getByLabel('Cantidad (L)')).toHaveValue('19.5');
 await second.getByLabel('Lote').fill('B');
 await water.getByRole('button',{name:'Siguiente →'}).click();
 await expect(page.getByRole('alert')).toContainText('vencimiento');
 await second.getByLabel('Vencimiento').fill('2027-02-01');
 await expect(water).toContainText('Total: 30 L');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await page.getByRole('button',{name:'Guardar y confirmar elaboración'}).click();
 await expect(page.getByRole('status')).toContainText('guardada y confirmada');
 const row=await page.evaluate(()=>JSON.parse(localStorage.getItem('picui-preview-batches-v1'))[0].weighings.find(w=>w.ingredient_id==='agua'));
 expect(row.actual_quantity).toBe(30);
 expect(row.brands).toEqual([{name:'Agua',actual_quantity:10.5,lot:'A',expiry_date:'2027-01-01'},
  {name:'Proveedor nuevo',actual_quantity:19.5,lot:'B',expiry_date:'2027-02-01'}]);
});

test('a new single brand can be started, resumed and updated without entering lot or expiry', async({page})=>{
 await open(page);
 const flour=page.locator('details[data-ingredient="harina"]');
 await flour.getByRole('button',{name:'Otra marca',exact:true}).click();
 const custom=flour.getByRole('group',{name:'Marca 1',exact:true});
 await custom.getByLabel('Marca',{exact:true}).fill('Molino del Sur');
 await custom.getByRole('button',{name:'Usar 25 kg sugeridos'}).click();
 await page.getByText('Más opciones',{exact:true}).click();
 await page.getByText('Continuar más tarde (opcional)',{exact:true}).click();
 await page.getByRole('button',{name:'Iniciar elaboración',exact:true}).click();
 const batch=page.getByRole('article');
 const saved=batch.getByRole('group',{name:'Marca 1',exact:true});
 await expect(saved.getByLabel('Marca',{exact:true})).toHaveValue('Molino del Sur');
 await saved.getByLabel('Cantidad (kg)').fill('24,5');
 await batch.getByRole('button',{name:'Guardar cambios de peso',exact:true}).click();
 await expect(batch.getByText('Peso registrado.',{exact:true})).toBeVisible();
 await batch.getByRole('button',{name:'Confirmar incorporación',exact:true}).click();
 await expect(saved.getByLabel('Marca',{exact:true})).toHaveAttribute('readonly','');
 const [record]=await page.evaluate(()=>JSON.parse(localStorage.getItem('picui-preview-batches-v1')));
 expect(record.weighings[0].brands).toEqual([{name:'Molino del Sur',actual_quantity:24.5,lot:null,expiry_date:null}]);
});
