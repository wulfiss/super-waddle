import {test,expect} from '@playwright/test';
import {clickSidebar} from './helpers/sidebar.mjs';
async function setup(page){
 await page.goto('/');await page.getByLabel('Cuenta de prueba').selectOption('preview-admin');await clickSidebar(page,'Recetas');
 await page.getByRole('article',{name:'Pan mignón',exact:true}).getByRole('button',{name:'Aprobar versión',exact:true}).click();await page.getByRole('button',{name:'Sí, aprobar versión',exact:true}).click();
 await expect(page.getByRole('article',{name:'Pan mignón',exact:true})).toContainText('Vigente');
 await page.getByLabel('Cuenta de prueba').selectOption('preview-bakery');await clickSidebar(page,'Elaboraciones');
 const id=await page.locator('#batch-recipe option').nth(1).getAttribute('value');await page.getByLabel('Receta vigente',{exact:true}).selectOption(id);
 await page.getByLabel('Fecha de producción',{exact:true}).fill('2026-11-17');await page.getByLabel('Responsable de elaboración',{exact:true}).fill('Pesaje');
 await page.getByLabel('Materia prima 1 (elegí una)',{exact:true}).selectOption('1');await page.getByLabel('Materia prima 6 (elegí una)',{exact:true}).selectOption('0');
 if(!await page.getByRole('button',{name:'Iniciar elaboración',exact:true}).isVisible()){if(!await page.getByText('Continuar más tarde (opcional)',{exact:true}).isVisible())await page.getByText('Más opciones',{exact:true}).click();await page.getByText('Continuar más tarde (opcional)',{exact:true}).click();}await page.getByRole('button',{name:'Iniciar elaboración',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Elaboración iniciada'})).toBeVisible();
 return page.getByRole('article',{name:'Elaboración de Pesaje - Pan mignón',exact:true});
}
function row(batch,name){return batch.getByRole('listitem',{name:'Pesaje de '+name,exact:true});}
const flour='Harina 000 Lealtad';

test('guided weighing matches expected amounts, preserves corrections and closes with discrepancies',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const batch=await setup(page),harina=row(batch,flour);
 await expect(batch.getByRole('heading',{name:'Registro de elaboración',exact:true})).toBeVisible();await expect(batch).toContainText('Fórmula base: 25 kg');await expect(batch).toContainText('Sin tolerancias definidas');
 await harina.getByLabel('Peso real de '+flour,{exact:true}).fill('24');await expect(harina).toContainText('-1 kg (-4 %)');await expect(harina).toContainText('Sin guardar');
 await harina.getByText('Lote y vencimiento (opcional)',{exact:true}).click();await harina.getByLabel('Lote de '+flour,{exact:true}).fill('LOT-01');await harina.getByLabel('Vencimiento de '+flour,{exact:true}).fill('2020-01-01');
 await expect(harina).toContainText('vencimiento es anterior');await harina.getByRole('button',{name:'Registrar peso',exact:true}).click();await expect(harina.getByRole('status')).toContainText('Peso registrado');
 await harina.getByLabel('Peso real de '+flour,{exact:true}).fill('25');await expect(harina.getByRole('button',{name:'Confirmar incorporación',exact:true})).toBeDisabled();
 await harina.getByRole('button',{name:'Guardar cambios de peso',exact:true}).click();await harina.getByRole('button',{name:'Confirmar incorporación',exact:true}).click();await expect(harina.getByLabel('Peso real de '+flour,{exact:true})).not.toBeEditable();
 await harina.getByText('Historial de '+flour,{exact:true}).click();await expect(harina).toContainText('24 → 25');
 for(const [name,amount]of [['Agua','31'],['Sal fina Dos Anclas','1'],['Levadura virgen','250'],['Mejorador Fórmula 1','300']]){
  const ingredient=row(batch,name);await ingredient.getByLabel('Peso real de '+name,{exact:true}).fill(amount);await ingredient.getByRole('button',{name:'Registrar peso',exact:true}).click();await ingredient.getByRole('button',{name:'Confirmar incorporación',exact:true}).click();
 }
 await expect(batch.getByRole('status').filter({hasText:'Elaboración cerrada automáticamente'})).toBeVisible();await expect(batch).toContainText('diferencias registradas se conservaron');
 await expect(batch.getByRole('button',{name:'Corregir registro',exact:true})).toHaveCount(0);
 const closedAt=await page.evaluate(()=>JSON.parse(localStorage.getItem('picui-preview-batches-v1'))[0].closed_at);
 await page.reload();await clickSidebar(page,'Elaboraciones');await batch.getByRole('button',{name:'Ver cantidades sugeridas',exact:true}).click();await expect(batch).toContainText('Cerrada');
 await page.getByLabel('Cuenta de prueba').selectOption('preview-admin');await clickSidebar(page,'Elaboraciones');await batch.getByRole('button',{name:'Ver cantidades sugeridas',exact:true}).click();
 const water=row(batch,'Agua');await water.getByRole('button',{name:'Corregir registro',exact:true}).click();await water.getByLabel('Peso real de Agua',{exact:true}).fill('30');await water.getByLabel('Observación de corrección (opcional)',{exact:true}).fill('Corrección de transcripción');await water.getByRole('button',{name:'Guardar corrección',exact:true}).click();
 await expect(water.getByRole('status')).toContainText('Corrección guardada');await water.getByText('Historial de Agua',{exact:true}).click();await expect(water).toContainText('31 → 30');await expect(water).toContainText('Corrección de transcripción');
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('picui-preview-batches-v1'))[0]);expect(stored.closed_at).toBe(closedAt);expect(stored.status).toBe('closed');expect(stored.has_discrepancies).toBe(false);expect(stored.had_incorporated_discrepancies).toBe(true);
 expect(stored.events.find(e=>e.action==='closed').after_snapshot.weighings.find(w=>w.ingredient_id==='agua').actual_quantity).toBe(31);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);
});

test('lost acknowledgement keeps an unsaved draft; retry does not duplicate weights or events',async({page})=>{
 const batch=await setup(page),harina=row(batch,flour);await harina.getByLabel('Peso real de '+flour,{exact:true}).fill('24,5');
 await page.evaluate(()=>{const original=Storage.prototype.setItem;let failed=false;Storage.prototype.setItem=function(key,value){original.call(this,key,value);if(key==='picui-preview-batches-v1'&&!failed){failed=true;throw new Error('Respuesta perdida');}};});
 await harina.getByRole('button',{name:'Registrar peso',exact:true}).click();await expect(harina.getByRole('alert')).toContainText('Respuesta perdida');await expect(harina.getByRole('status')).toHaveCount(0);await expect(harina.getByLabel('Peso real de '+flour,{exact:true})).toHaveValue('24,5');
 await harina.getByRole('button',{name:'Registrar peso',exact:true}).click();await expect(harina.getByRole('status')).toContainText('Peso registrado');
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('picui-preview-batches-v1'))[0]);expect(stored.weighings).toHaveLength(1);expect(stored.events.filter(e=>e.action==='weight_saved')).toHaveLength(1);
 await expect(batch).toContainText('En curso');
});

test('another tab cannot silently overwrite a draft; refreshing the saved value is explicit',async({page,context})=>{
 const batch=await setup(page),harina=row(batch,flour);const other=await context.newPage();await other.goto('/');await clickSidebar(other,'Elaboraciones');
 const otherBatch=other.getByRole('article',{name:'Elaboración de Pesaje - Pan mignón',exact:true});await otherBatch.getByRole('button',{name:'Ver cantidades sugeridas',exact:true}).click();const otherFlour=row(otherBatch,flour);
 await otherFlour.getByLabel('Peso real de '+flour,{exact:true}).fill('24');await harina.getByLabel('Peso real de '+flour,{exact:true}).fill('25');await harina.getByRole('button',{name:'Registrar peso',exact:true}).click();
 await expect(otherFlour).toContainText('El registro cambió en otra sesión');await expect(otherFlour.getByLabel('Peso real de '+flour,{exact:true})).toHaveValue('24');
 await expect(otherFlour.getByRole('button',{name:'Guardar cambios de peso',exact:true})).toBeDisabled();
 await otherFlour.getByRole('button',{name:'Recargar peso guardado',exact:true}).click();await expect(otherFlour.getByLabel('Peso real de '+flour,{exact:true})).toHaveValue('25');
 await otherFlour.getByLabel('Peso real de '+flour,{exact:true}).fill('26');await otherFlour.getByRole('button',{name:'Guardar cambios de peso',exact:true}).click();await expect(harina.getByLabel('Peso real de '+flour,{exact:true})).toHaveValue('26');
});
