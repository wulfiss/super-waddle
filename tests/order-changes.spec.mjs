import{clickSidebar,openFromBakeryHome}from'./helpers/sidebar.mjs';
import { test, expect } from '@playwright/test';

async function createOrder(page) {
 await page.goto('/');
 await openFromBakeryHome(page,'Nuevo pedido');
 await page.getByRole('button',{name:'Masa para pizza kg'}).click();
 await page.getByLabel('Cantidad de Masa para pizza').fill('2');
 await page.getByRole('button',{name:/^Guardar pedido/}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Sí, guardar pedido'}).click();
 await expect(page.getByRole('status')).toContainText('guardado');
 await clickSidebar(page,'Historial');
}

test('bakery edits and removals update an open warehouse tab and retain the admin audit',async({page,context})=>{
 const errors=[];
 context.on('page',opened=>opened.on('pageerror',error=>errors.push(error.message)));
 page.on('pageerror',error=>errors.push(error.message));
 await createOrder(page);
 const orderLabel=await page.getByText(/^Pedido #/).textContent();
 const search=page.getByRole('searchbox',{name:'Buscar por pedido o responsable'});
 await search.fill(orderLabel.trim());
 await expect(page.getByRole('article')).toHaveCount(1);
 await search.fill('sin coincidencias');
 await expect(page.getByRole('article')).toHaveCount(0);
 await expect(page.getByText('No hay pedidos que coincidan con la búsqueda.')).toBeVisible();
 await search.fill('panaderia');
 await expect(page.getByRole('article')).toHaveCount(1);
 const warehouse=await context.newPage();
 await warehouse.goto('/');
 await warehouse.getByLabel('Cuenta de prueba').selectOption('preview-warehouse');
 await expect(warehouse.getByRole('article')).toContainText('2 kg');
 await expect(warehouse.getByRole('article')).toContainText(orderLabel);
 await expect(warehouse.getByRole('button',{name:'Editar pedido',exact:true})).toHaveCount(0);

 await page.getByRole('button',{name:'Editar pedido',exact:true}).click();
 await page.getByLabel('Cantidad de Masa para pizza').fill('4');
 await page.getByLabel('Fecha del pedido',{exact:true}).fill('2026-10-31');
 await page.getByRole('button',{name:/^Guardar cambios/}).click();
 const review=page.getByRole('dialog',{name:'Revisá los cambios'});
 await review.getByRole('button',{name:'Volver a editar'}).click();
 await expect(warehouse.getByRole('article')).toContainText('2 kg');
 await page.getByRole('button',{name:/^Guardar cambios/}).click();
 await review.getByRole('button',{name:'Sí, guardar cambios'}).click();
 await expect(page.getByRole('status')).toContainText('Pedido actualizado');
 await expect(warehouse.getByRole('article')).toHaveCount(1);
 await expect(warehouse.getByRole('article')).toContainText('4 kg');
 await expect(warehouse.getByRole('article')).toContainText('Equipo de panadería');
 await expect(warehouse.getByRole('article')).toContainText(orderLabel);

 const admin=await context.newPage();
 await admin.goto('/');
 await admin.getByLabel('Cuenta de prueba').selectOption('preview-admin');
 const log=admin.getByRole('region',{name:'Registro de cambios'});
 await expect(log.getByRole('article')).toHaveCount(2);
 const edited=log.getByRole('article',{name:'Pedido editado',exact:true});
 await expect(edited).toContainText('Equipo de panadería');
 await expect(edited).toContainText('Masa para pizza: 2 kg → 4 kg');
 await expect(edited.locator('time')).toHaveAttribute('datetime',/T/);

 await page.getByRole('button',{name:'Eliminar pedido',exact:true}).click();
 const removal=page.getByRole('dialog',{name:'¿Eliminar este pedido?'});
 await removal.getByRole('button',{name:'Volver al historial'}).click();
 await expect(warehouse.getByRole('article')).toHaveCount(1);
 await expect(log.getByRole('article')).toHaveCount(2);
 await page.getByRole('button',{name:'Eliminar pedido',exact:true}).click();
 await removal.getByRole('button',{name:'Sí, eliminar pedido'}).click();
 await expect(page.getByRole('heading',{name:'Todavía no hay pedidos'})).toBeVisible();
 await expect(warehouse.getByRole('article')).toHaveCount(0);
 await expect(log.getByRole('article')).toHaveCount(3);
 const removed=log.getByRole('article',{name:'Pedido eliminado',exact:true});
 await expect(removed).toContainText('Equipo de panadería');
 await removed.getByText('Ver detalle del cambio',{exact:true}).click();
 await expect(removed).toContainText('4 kg');
 await expect(removed).toContainText('Eliminado de los pedidos activos');
 await admin.reload();
 await expect(admin.getByRole('region',{name:'Registro de cambios'}).getByRole('article')).toHaveCount(3);
 for(const current of [page,warehouse,admin])expect(await current.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 expect(errors).toEqual([]);
});

test('an older edit cannot overwrite a newer version from another tab',async({page,context})=>{
 await createOrder(page);
 const other=await context.newPage();await other.goto('/');
 await clickSidebar(other,'Historial');
 await other.getByRole('button',{name:'Editar pedido',exact:true}).click();
 await page.getByRole('button',{name:'Editar pedido',exact:true}).click();
 await page.getByLabel('Cantidad de Masa para pizza').fill('5');
 await page.getByRole('button',{name:/^Guardar cambios/}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Sí, guardar cambios'}).click();
 await expect(page.getByRole('status')).toContainText('Pedido actualizado');
 await other.getByLabel('Cantidad de Masa para pizza').fill('6');
 await other.getByRole('button',{name:/^Guardar cambios/}).click();
 await other.getByRole('dialog').getByRole('button',{name:'Sí, guardar cambios'}).click();
 await expect(other.getByRole('alert')).toContainText('El pedido cambió');
 await other.getByRole('button',{name:'Cancelar edición'}).click();
 await expect(other.getByRole('article')).toContainText('5 kg');
 const workspace=await page.evaluate(()=>JSON.parse(localStorage.getItem('obrador-preview-workspace-v1')));
 expect(workspace.orders).toHaveLength(1);expect(workspace.audit).toHaveLength(2);
});

 test('warehouse completion disables history actions and rejects an already open edit',async({page,context})=>{
  await createOrder(page);
  await expect(page.getByRole('button',{name:'Editar pedido',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Eliminar pedido',exact:true})).toBeEnabled();
  const stale=await context.newPage();await stale.goto('/');await clickSidebar(stale,'Historial');
  await stale.getByRole('button',{name:'Editar pedido',exact:true}).click();
  const warehouse=await context.newPage();await warehouse.goto('/');
  await warehouse.getByLabel('Cuenta de prueba').selectOption('preview-warehouse');
  await warehouse.getByRole('checkbox',{name:'Registrado',exact:true}).check();
  await expect(page.getByRole('button',{name:'Editar pedido',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Eliminar pedido',exact:true})).toBeDisabled();
  await expect(page.getByText('Depósito ya registró este pedido. No se puede editar ni eliminar.',{exact:true})).toBeVisible();
  await stale.getByLabel('Cantidad de Masa para pizza').fill('9');
  await stale.getByRole('button',{name:/^Guardar cambios/}).click();
  await stale.getByRole('dialog').getByRole('button',{name:'Sí, guardar cambios'}).click();
  await expect(stale.getByRole('alert')).toContainText('Depósito ya registró este pedido');
  await page.reload();
  await page.getByLabel('Cuenta de prueba').selectOption('preview-bakery');
  await clickSidebar(page,'Historial');
  await expect(page.getByRole('button',{name:'Editar pedido',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Eliminar pedido',exact:true})).toBeDisabled();
  await expect(page.getByRole('article')).toContainText('2 kg');
 });
