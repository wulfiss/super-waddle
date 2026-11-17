import {test,expect} from '@playwright/test';
import {clickSidebar} from './helpers/sidebar.mjs';
async function approveRecipe(page){
 await page.goto('/');await page.getByLabel('Cuenta de prueba').selectOption('preview-admin');await clickSidebar(page,'Recetas');
 await page.getByRole('article',{name:'Pan mignón',exact:true}).getByRole('button',{name:'Aprobar versión',exact:true}).click();
 await page.getByRole('button',{name:'Sí, aprobar versión',exact:true}).click();
 await expect(page.getByRole('article',{name:'Pan mignón',exact:true})).toContainText('Vigente · v1');
 await page.getByLabel('Cuenta de prueba').selectOption('preview-bakery');await clickSidebar(page,'Elaboraciones');
 await expect(page.getByRole('button',{name:'Actualizar elaboraciones',exact:true})).toBeEnabled();
}
async function selectRecipe(page){const value=await page.locator('#batch-recipe option').nth(1).getAttribute('value');await page.getByLabel('Receta vigente',{exact:true}).selectOption(value);}
async function chooseIngredients(page){await page.getByLabel('Materia prima 1 (elegí una)',{exact:true}).selectOption('1');await page.getByLabel('Materia prima 6 (elegí una)',{exact:true}).selectOption('0');}

test('unapproved recipes are unavailable and starting preserves one flour, metadata and saved quantities',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await clickSidebar(page,'Elaboraciones');
 await expect(page.getByText('No hay recetas vigentes.',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Iniciar elaboración',exact:true})).toBeDisabled();
 await approveRecipe(page);await selectRecipe(page);
 await page.getByLabel('Fecha de producción',{exact:true}).fill('2026-12-01');
 await page.getByLabel('Responsable de elaboración',{exact:true}).fill('Lucía');
 await page.getByLabel('Unidades de elaboración (amasadas)',{exact:true}).fill('2');
 await expect(page.getByLabel('Incluir Extracto de malta (opcional)',{exact:true})).not.toBeChecked();
 await page.getByRole('button',{name:'Iniciar elaboración',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('alternativa');
 await chooseIngredients(page);await page.getByRole('button',{name:'Iniciar elaboración',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Elaboración iniciada'})).toBeVisible();
 const batch=page.getByRole('article',{name:'Elaboración de Lucía - Pan mignón',exact:true});
 await expect(batch).toContainText('1 de diciembre de 2026');await expect(batch).toContainText('2 amasadas');
 await expect(batch).toContainText('Harina 000 Lealtad');await expect(batch).not.toContainText('Harina 000 Cañuelas');
 await expect(batch).toContainText('50 kg');await expect(batch).toContainText('60 L');await expect(batch).toContainText('No incluido');
 await expect(batch).toContainText('Cantidades provisorias');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('obrador-preview-workspace-v1')??'{"orders":[]}').orders.length)).toBe(0);
 await page.reload();await clickSidebar(page,'Elaboraciones');await batch.getByRole('button',{name:'Ver cantidades sugeridas',exact:true}).click();await expect(batch).toContainText('50 kg');
 await page.getByLabel('Cuenta de prueba').selectOption('preview-admin');await clickSidebar(page,'Recetas');
 await page.getByRole('article',{name:'Pan mignón',exact:true}).getByRole('button',{name:'Editar receta',exact:true}).click();
 await page.getByLabel('Cantidad base 1',{exact:true}).fill('24');await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
 await page.getByRole('article',{name:'Pan mignón',exact:true}).getByRole('button',{name:'Aprobar versión',exact:true}).click();await page.getByRole('button',{name:'Sí, aprobar versión',exact:true}).click();
 await clickSidebar(page,'Elaboraciones');await expect(page.getByRole('heading',{name:'Todas las elaboraciones',exact:true})).toBeVisible();
 await batch.getByRole('button',{name:'Ver cantidades sugeridas',exact:true}).click();await expect(batch).toContainText('v1');await expect(batch).toContainText('50 kg');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);
});

test('fractional batches, optional ingredients and validation are explicit',async({page})=>{
 await approveRecipe(page);await selectRecipe(page);await chooseIngredients(page);
 await page.getByLabel('Responsable de elaboración',{exact:true}).fill('');await page.getByRole('button',{name:'Iniciar elaboración',exact:true}).click();await expect(page.getByRole('alert')).toContainText('responsable');
 await page.getByLabel('Responsable de elaboración',{exact:true}).fill('Turno mañana');await page.getByLabel('Unidades de elaboración (amasadas)',{exact:true}).fill('0');
 await page.getByRole('button',{name:'Iniciar elaboración',exact:true}).click();await expect(page.getByRole('alert')).toContainText('amasadas');
 await page.getByLabel('Unidades de elaboración (amasadas)',{exact:true}).fill('0,5');await page.getByLabel('Incluir Extracto de malta (opcional)',{exact:true}).check();
 await page.getByRole('button',{name:'Iniciar elaboración',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Elaboración iniciada'})).toBeVisible();
 const batch=page.getByRole('article');await expect(batch).toContainText('0,5 amasadas');await expect(batch).toContainText('12,5 kg');await expect(batch).toContainText('15 L');
 const malt=batch.getByRole('listitem').filter({hasText:'Extracto de malta'});await expect(malt).toContainText('125 g');
});

test('a lost save response retains the form and retry creates only one batch',async({page})=>{
 await approveRecipe(page);await selectRecipe(page);await chooseIngredients(page);await page.getByLabel('Responsable de elaboración',{exact:true}).fill('Reintento');
 await page.evaluate(()=>{const original=Storage.prototype.setItem;let first=true;Storage.prototype.setItem=function(key,value){original.call(this,key,value);if(key==='picui-preview-batches-v1'&&first){first=false;throw new Error('Respuesta perdida');}};});
 await page.getByRole('button',{name:'Iniciar elaboración',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Respuesta perdida');await expect(page.getByLabel('Responsable de elaboración',{exact:true})).toHaveValue('Reintento');await expect(page.getByRole('status')).toHaveCount(0);
 await page.getByRole('button',{name:'Iniciar elaboración',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Elaboración iniciada'})).toBeVisible();
 await expect(page.getByRole('article')).toHaveCount(1);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('picui-preview-batches-v1')).length)).toBe(1);
});

test('an archived recipe is rejected even when the form has not refreshed',async({page})=>{
 await approveRecipe(page);await selectRecipe(page);await chooseIngredients(page);await page.getByLabel('Responsable de elaboración',{exact:true}).fill('Receta archivada');
 await page.evaluate(()=>{const store=JSON.parse(localStorage.getItem('picui-preview-recipes-v1'));store.recipes[0].active=false;localStorage.setItem('picui-preview-recipes-v1',JSON.stringify(store));});
 await page.getByRole('button',{name:'Iniciar elaboración',exact:true}).click();await expect(page.getByRole('alert')).toContainText('vigente');
 await expect(page.getByRole('article')).toHaveCount(0);await expect(page.getByLabel('Responsable de elaboración',{exact:true})).toHaveValue('Receta archivada');
 await page.getByRole('button',{name:'Actualizar elaboraciones',exact:true}).click();await expect(page.getByRole('button',{name:'Iniciar elaboración',exact:true})).toBeDisabled();
 await page.getByLabel('Cuenta de prueba').selectOption('preview-warehouse');
 const menu=page.getByRole('button',{name:'Abrir menú',exact:true});if(await menu.isVisible())await menu.click();await expect(page.getByRole('button',{name:'Elaboraciones',exact:true})).toHaveCount(0);
});
