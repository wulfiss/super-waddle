import { test, expect } from '@playwright/test';

test('saves an order and preserves its history after reload', async ({ page }) => {
 const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 await page.goto('/');
 await expect(page.getByRole('button', { name: 'Guardar pedido' })).toBeEnabled();
 await page.getByLabel('Responsable', { exact: true }).fill('María Pérez');
 await page.getByLabel('Buscar productos').fill('Masa');
 await page.getByRole('button', { name: 'Masa para pizza kg' }).click();
 await page.getByLabel('Cantidad de Masa para pizza').fill('2.5');
 await page.getByRole('button', { name: 'Guardar pedido' }).click();
 await expect(page.getByRole('status')).toContainText('guardado en este dispositivo');
 await page.getByRole('button', { name: 'Historial' }).click();
 await expect(page.getByText('María Pérez', { exact: true })).toBeVisible();
 await expect(page.getByText('2,5 kg', { exact: true })).toBeVisible();
 await page.reload();
 await expect(page.getByRole('button', { name: 'Guardar pedido' })).toBeEnabled();
 await page.getByRole('button', { name: 'Historial' }).click();
 await expect(page.getByText('María Pérez', { exact: true })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
 expect(errors).toEqual([]);
});
