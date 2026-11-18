import {openField} from './helpers/formulation-fields.mjs';
import {test,expect} from '@playwright/test';
import {clickSidebar} from './helpers/sidebar.mjs';
async function open(page){
 await page.goto('/');await page.getByLabel('Cuenta de prueba').selectOption('preview-admin');await clickSidebar(page,'Recetas');await page.getByRole('button',{name:'Aprobar versión',exact:true}).click();await page.getByRole('button',{name:'Sí, aprobar versión',exact:true}).click();await expect(page.getByRole('article')).toContainText('Vigente');
 await page.getByLabel('Cuenta de prueba').selectOption('preview-bakery');await clickSidebar(page,'Elaboraciones');const id=await page.locator('#batch-recipe option').nth(1).getAttribute('value');await page.getByLabel('Receta vigente',{exact:true}).selectOption(id);await page.getByLabel('Responsable de elaboración',{exact:true}).fill('Entrada rápida');await (await openField(page,'Materia prima 1 (elegí una)')).selectOption('1');await (await openField(page,'Materia prima 6 (elegí una)')).selectOption('0');await openField(page,'Peso real de Harina 000 Lealtad');
}
async function fill(page){for(const [name,value]of [['Harina 000 Lealtad','25'],['Agua','31'],['Sal fina Dos Anclas','1'],['Levadura virgen','250'],['Mejorador Fórmula 1','300']])await (await openField(page,'Peso real de '+name)).fill(value);}
test('weights appear on product selection and one action saves and confirms all ingredients',async({page})=>{
 await open(page);await expect(page.getByLabel('Peso real de Harina 000 Lealtad',{exact:true})).toBeVisible();await expect(page.getByLabel('Peso real de Agua',{exact:true})).not.toBeVisible();await expect(page.getByRole('button',{name:'Iniciar elaboración',exact:true})).not.toBeVisible();await expect(page.getByRole('button',{name:'Registrar peso',exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Lote 1',{exact:true})).toBeVisible();await expect(page.getByLabel('Vencimiento 1',{exact:true})).toBeVisible();await page.getByLabel('Lote 1',{exact:true}).fill('LOT-COMPACT');await page.getByLabel('Vencimiento 1',{exact:true}).fill('2027-01-31');
 await fill(page);await page.getByRole('button',{name:'Guardar y confirmar elaboración',exact:true}).click();await expect(page.getByRole('status')).toContainText('guardada y confirmada');await expect(page.getByRole('article')).toContainText('Cerrada');
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('picui-preview-batches-v1')));expect(stored).toHaveLength(1);expect(stored[0].weighings).toHaveLength(5);expect(stored[0].weighings.every(w=>w.incorporated)).toBe(true);expect(stored[0].has_discrepancies).toBe(true);expect(stored[0].weighings.find(w=>w.ingredient_id==='harina').lot).toBe('LOT-COMPACT');expect(stored[0].weighings.find(w=>w.ingredient_id==='harina').expiry_date).toBe('2027-01-31');
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
 await flour.getByRole('button',{name:'Usar sugerido',exact:true}).click();await expect(page.getByLabel('Peso real de Harina 000 Lealtad',{exact:true})).toHaveValue('25');
 expect(await page.evaluate(()=>localStorage.getItem('picui-preview-batches-v1'))).toBeNull();
 await page.getByLabel('Lote 1',{exact:true}).fill('L-GUIDED');await flour.getByRole('button',{name:'Siguiente →',exact:true}).click();
 await expect(page.getByLabel('Peso real de Agua',{exact:true})).toBeVisible();await page.getByLabel('Peso real de Agua',{exact:true}).fill('40');
 const summary=page.getByRole('region',{name:'Resumen de elaboración',exact:true});await expect(summary).toContainText('40 / 30 L');await expect(summary).toContainText('+33,33 %');
 await openField(page,'Peso real de Harina 000 Lealtad');await expect(page.getByLabel('Lote 1',{exact:true})).toHaveValue('L-GUIDED');await expect(page.getByLabel('Peso real de Harina 000 Lealtad',{exact:true})).toHaveValue('25');await expect(page.locator('details[data-ingredient][open]')).toHaveCount(1);
});
