import {openFromBakeryHome} from './helpers/sidebar.mjs';
import{test,expect}from'@playwright/test';
import {demoProducts} from '../src/lib/production.ts';
test('order validation explains missing products and invalid quantities without an editable responsible field',async({page},testInfo)=>{
 await page.goto('/');
 await openFromBakeryHome(page,'Nuevo pedido');const save=page.getByRole('button',{name:/^Guardar pedido/});await expect(save).toBeEnabled();
 await expect(page.getByRole('textbox',{name:'Responsable',exact:true})).toHaveCount(0);
 await save.click();await expect(page.locator('#page-error')).toContainText('Agregá al menos un producto');
 await expect(page.getByRole('dialog',{name:'Revisá tu pedido'})).not.toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('obrador-preview-workspace-v1'))).toBeNull();
 const catalog=page.getByRole('region',{name:'Productos disponibles'});await expect(catalog.locator('small')).toHaveCount(0);
 await page.getByRole('button',{name:'Pan de campo unidades',exact:true}).click();await expect(page.locator('.selected small')).toHaveCount(0);
 const quantity=page.getByLabel('Cantidad de Pan de campo',{exact:true});if(testInfo.project.name.includes('mobile')){await expect(quantity).toBeFocused();await expect(quantity).toBeInViewport();}
 await expect(quantity).toHaveValue('');await save.click();await expect(page.locator('#page-error')).toContainText('cantidades');await quantity.fill('0');await save.click();await expect(page.locator('#page-error')).toContainText('cantidades');
 await quantity.fill('2');await save.click();await expect(page.getByRole('dialog',{name:'Revisá tu pedido'})).toBeVisible();
 await page.getByRole('button',{name:'Volver a editar',exact:true}).click();await expect(quantity).toHaveValue('2');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
test('product window retains four readable rows on mobile and desktop',async({page},testInfo)=>{
 await page.goto('/');
 await openFromBakeryHome(page,'Nuevo pedido');const catalog=page.getByRole('region',{name:'Productos disponibles'});const mobile=testInfo.project.name.includes('mobile');await expect(catalog.getByRole('button')).toHaveCount(mobile?4:demoProducts.length);await catalog.scrollIntoViewIfNeeded();
 const layout=await catalog.evaluate(e=>{const box=e.getBoundingClientRect();const buttons=[...e.querySelectorAll('button')];return{shown:buttons.filter(b=>{const r=b.getBoundingClientRect();return r.top>=box.top&&r.bottom<=box.bottom;}).length,font:parseFloat(getComputedStyle(buttons[0]).fontSize),height:box.height};});
 expect(layout.shown).toBe(4);if(mobile){
  expect(layout.font).toBeGreaterThanOrEqual(16);
  expect(await catalog.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
  const previous=page.getByRole('button',{name:'Anterior',exact:true});
  const next=page.getByRole('button',{name:'Siguiente',exact:true});
  expect((await previous.boundingBox()).y).toBe((await next.boundingBox()).y);
  await next.click();
  await expect(catalog.getByRole('button')).toHaveCount(demoProducts.length-4);
  await page.getByLabel('Buscar productos').fill('pan');
  await expect(catalog.getByRole('button',{name:'Pan de campo unidades'})).toBeVisible();
  await page.getByLabel('Buscar productos').fill('');
  await expect(page.getByRole('button',{name:'Anterior',exact:true})).toBeDisabled();
  await catalog.getByRole('button',{name:'Pan de campo unidades'}).click();
  await catalog.getByRole('button',{name:'Masa para pizza kg'}).click();
  const first=page.getByLabel('Cantidad de Pan de campo');
  const second=page.getByLabel('Cantidad de Masa para pizza');
  await expect(second).toBeFocused();
  await expect(page.getByText('Falta completar 2 cantidades')).toBeVisible();
  await page.getByRole('button',{name:/^Guardar pedido/}).click();
  await expect(first).toBeFocused();
  await first.fill('2');await second.fill('3.5');
  await page.getByRole('button',{name:/^Guardar pedido/}).click();
  await expect(page.getByRole('dialog',{name:'Revisá tu pedido'})).toContainText('3,5 kg');
 }
});
