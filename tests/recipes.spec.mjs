import {test,expect} from '@playwright/test';
import {clickSidebar} from './helpers/sidebar.mjs';
async function openRecipes(page){await page.goto('/');await page.getByLabel('Cuenta de prueba').selectOption('preview-admin');await clickSidebar(page,'Recetas');await expect(page.getByRole('heading',{name:'Recetas y formulaciones'})).toBeVisible();}

test('admin manages provisional recipe versions, exclusive flour options and archive history',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await openRecipes(page);
 const recipe=page.getByRole('article',{name:'Pan mignón',exact:true});
 await expect(recipe).toContainText('Cantidades provisorias');await expect(recipe).toContainText('Harina 000 Cañuelas o Harina 000 Lealtad');
 await expect(recipe).toContainText('Extracto de malta (opcional)');await expect(recipe).toContainText('Borrador · v1');
 await recipe.getByRole('button',{name:'Aprobar versión',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('provisorias');await page.getByRole('button',{name:'Sí, aprobar versión',exact:true}).click();
 await expect(recipe).toContainText('Vigente · v1');
 await recipe.getByRole('button',{name:'Editar receta',exact:true}).click();
 await page.getByLabel('Cantidad base 1',{exact:true}).fill('24,5');
 await page.getByLabel('Alternativas 1 (una por línea)',{exact:true}).fill('Harina 000 Lealtad\nHarina alternativa de prueba');
 await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
 await expect(recipe).toContainText('Borrador · v2');await expect(recipe).toContainText('24,5 kg');
 await expect(recipe).toContainText('La versión vigente sigue siendo v1');
 await recipe.getByRole('button',{name:'Historial de versiones'}).click();
 const history=page.getByRole('region',{name:'Versiones de Pan mignón'});
 await history.locator('summary').filter({hasText:'v1 · Vigente'}).click();
 await expect(history).toContainText('25 kg');
 await recipe.getByRole('button',{name:'Aprobar versión',exact:true}).click();await page.getByRole('button',{name:'Sí, aprobar versión',exact:true}).click();
 await expect(recipe).toContainText('Vigente · v2');
 await recipe.getByRole('button',{name:'Eliminar receta',exact:true}).click();await page.getByRole('button',{name:'Sí, archivar receta',exact:true}).click();
 await expect(recipe).toHaveCount(0);await page.getByLabel('Incluir archivadas').check();await expect(recipe).toContainText('Archivada');
 await expect(recipe.getByRole('button',{name:'Editar receta'})).toHaveCount(0);
 await page.reload();await clickSidebar(page,'Recetas');await page.getByLabel('Incluir archivadas').check();await expect(recipe).toContainText('Archivada');
 expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});

test('create validation, ingredient ordering, persistence and role navigation',async({page})=>{
 await openRecipes(page);await page.getByRole('button',{name:'Agregar receta',exact:true}).click();
 await page.getByLabel('Código',{exact:true}).fill('TEST-01');await page.getByLabel('Nombre de receta',{exact:true}).fill('Receta de prueba');
 await page.getByLabel('Materia prima 1',{exact:true}).fill('Harina');await page.getByLabel('Cantidad base 1',{exact:true}).fill('0');
 await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await expect(page.getByRole('alert')).toContainText('cantidad positiva');
 await page.getByLabel('Cantidad base 1',{exact:true}).fill('10');await page.getByRole('button',{name:'Agregar ingrediente',exact:true}).click();
 await page.getByLabel('Materia prima 2',{exact:true}).fill('Agua');await page.getByLabel('Cantidad base 2',{exact:true}).fill('5,5');await page.getByLabel('Unidad 2',{exact:true}).selectOption('L');
 await page.getByRole('button',{name:'Subir ingrediente 2',exact:true}).click();await expect(page.getByLabel('Materia prima 1',{exact:true})).toHaveValue('Agua');
 await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await expect(page.getByRole('article',{name:'Receta de prueba',exact:true})).toContainText('5,5 L');
 await page.reload();await clickSidebar(page,'Recetas');await expect(page.getByRole('article',{name:'Receta de prueba',exact:true})).toContainText('5,5 L');
 await page.getByLabel('Buscar recetas',{exact:true}).fill('TEST-01');await expect(page.getByRole('article')).toHaveCount(1);
 await page.getByLabel('Cuenta de prueba').selectOption('preview-bakery');
 const menu=page.getByRole('button',{name:'Abrir menú',exact:true});if(await menu.isVisible())await menu.click();
 await expect(page.getByRole('button',{name:'Recetas',exact:true})).toHaveCount(0);
});

test('failed save keeps recipe form editable without false success',async({page})=>{
 await openRecipes(page);await page.getByRole('article',{name:'Pan mignón',exact:true}).getByRole('button',{name:'Editar receta',exact:true}).click();
 await page.getByLabel('Cantidad base 1',{exact:true}).fill('22');
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='picui-preview-recipes-v1')throw new Error('Guardado no disponible');return original.call(this,key,value);};});
 await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Guardado no disponible');
 await expect(page.getByLabel('Cantidad base 1',{exact:true})).toHaveValue('22');
 await expect(page.getByRole('status')).toHaveCount(0);
});
