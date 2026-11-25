import{clickSidebar,openFromBakeryHome}from'./helpers/sidebar.mjs';
import { test, expect } from '@playwright/test';

test('saves an order and preserves its history after reload', async ({ page }) => {
 const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 await page.goto('/');
 await openFromBakeryHome(page,'Nuevo pedido');
 await expect(page.getByRole('button', { name: /^Revisar pedido/ })).toBeDisabled();
 await page.getByLabel('Buscar productos').fill('Masa');
 await page.getByRole('button', { name: 'Masa para pizza kg' }).click();
 await page.getByLabel('Cantidad de Masa para pizza').fill('2.5');
 await page.getByRole('button',{name:'Agregar al pedido',exact:true}).click();
 await page.getByRole('button', { name: /^Revisar pedido/ }).click();
 const review=page.getByRole('dialog', {name:'Revisá tu pedido'});
 await expect(review).toBeVisible();
 await expect(review).toContainText('Equipo de panadería');
 await expect(review).toContainText('Masa para pizza');
 await expect(review).toContainText('2,5 kg');
 expect(await page.evaluate(()=>localStorage.getItem('obrador-preview-workspace-v1'))).toBeNull();
 await review.getByRole('button',{name:'Volver a editar'}).click();
 await expect(review).not.toBeVisible();
 await expect(page.getByRole('button',{name:'Cambiar Masa para pizza'})).toContainText('Agregado · 2,5 kg');
 await page.getByRole('button', { name: /^Revisar pedido/ }).click();
 await review.getByRole('button',{name:'Sí, guardar pedido'}).click();
 await expect(page.getByRole('status')).toContainText('guardado en este dispositivo');
 await clickSidebar(page,'Historial');
 await expect(page.getByRole('article').getByText('Equipo de panadería', { exact: true })).toBeVisible();
 await expect(page.getByRole('article').getByText('2,5 kg', { exact: true })).toBeVisible();
 await page.reload();
 await expect(page.getByRole('heading',{name:'Inicio',exact:true})).toBeVisible();
 await clickSidebar(page,'Historial');
 await expect(page.getByRole('article').getByText('Equipo de panadería', { exact: true })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
 expect(errors).toEqual([]);
});

test('bakery home opens each task and is reachable from the sidebar', async ({page}) => {
 await page.goto('/');
 const home = page.getByRole('navigation',{name:'Opciones de panadería'});
 for(const name of ['Nuevo pedido','Pedido extra','Elaboraciones','Historial']){
  await expect(home.getByRole('button')).toHaveCount(4);
  await openFromBakeryHome(page,name);
  await expect(page.getByRole('heading',{name,exact:true,level:1})).toBeVisible();
  await clickSidebar(page,'Inicio');
 }
 await expect(home).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
