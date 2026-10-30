import { test, expect } from '@playwright/test';

test('staff see their own tab and an administrator can switch between all screens', async ({ page }) => {
 const errors = [];
 const remoteRequests = [];
 page.on('pageerror', error => errors.push(error.message));
 page.on('request', request => { if (new URL(request.url()).hostname.endsWith('.supabase.co')) remoteRequests.push(request.url()); });
 await page.goto('/');
 await expect(page.getByRole('button', { name: 'Guardar pedido' })).toBeEnabled();
 await expect(page.getByLabel('Correo electrónico')).toHaveCount(0);
 await expect(page.getByLabel('Cuenta de prueba')).toHaveValue('preview-bakery');
 await expect(page.getByRole('tab')).toHaveCount(1);
 await expect(page.getByRole('tab', { name: 'Panadería' })).toHaveAttribute('aria-selected', 'true');

 await page.getByLabel('Responsable', { exact: true }).fill('Equipo de panadería');
 await page.getByRole('button', { name: 'Pan de campo unidades' }).click();
 await page.getByRole('button', { name: /^Guardar pedido/ }).click();
 await page.getByRole('dialog').getByRole('button', { name: 'Sí, guardar pedido' }).click();
 await expect(page.getByRole('status')).toContainText('guardado');

 await page.getByLabel('Cuenta de prueba').selectOption('preview-warehouse');
 await expect(page.getByRole('tab')).toHaveCount(1);
 await expect(page.getByRole('tab', { name: 'Depósito' })).toHaveAttribute('aria-selected', 'true');
 await expect(page.getByRole('button', { name: /Guardar pedido/ })).toHaveCount(0);
 await expect(page.getByRole('article')).toContainText('Equipo de panadería');
 await page.reload();
 await expect(page.getByLabel('Cuenta de prueba')).toHaveValue('preview-warehouse');
 await expect(page.getByRole('tab', { name: 'Depósito' })).toHaveAttribute('aria-selected', 'true');
 await page.getByLabel('Buscar pedidos').fill('Sin coincidencias');
 await expect(page.getByText('No hay coincidencias', { exact: true })).toBeVisible();
 await page.getByLabel('Buscar pedidos').fill('Pan de campo');
 await expect(page.getByRole('article')).toHaveCount(1);

 await page.getByLabel('Cuenta de prueba').selectOption('preview-admin');
 await expect(page.getByRole('tab')).toHaveCount(3);
 await expect(page.getByRole('tab', { name: 'Administración' })).toHaveAttribute('aria-selected', 'true');
 await page.getByRole('button', { name: /Abrir depósito/ }).click();
 await expect(page.getByRole('article')).toContainText('Equipo de panadería');
 await page.getByRole('tab', { name: 'Panadería' }).click();
 await expect(page.getByRole('button', { name: /Guardar pedido/ })).toBeVisible();
 await page.getByRole('tab', { name: 'Panadería' }).press('End');
 await expect(page.getByRole('tab', { name: 'Administración' })).toBeFocused();
 await expect(page.getByRole('tab', { name: 'Administración' })).toHaveAttribute('aria-selected', 'true');
 await page.getByRole('tab', { name: 'Administración' }).press('ArrowRight');
 await expect(page.getByRole('tab', { name: 'Panadería' })).toBeFocused();
 await page.getByRole('button', { name: 'Pan de campo unidades' }).click();
 await page.getByRole('button', { name: /^Guardar pedido/ }).click();
 await page.getByRole('dialog').getByRole('button', { name: 'Sí, guardar pedido' }).click();
 await expect(page.getByRole('status')).toContainText('guardado');
 await page.getByRole('tab', { name: 'Depósito' }).click();
 await expect(page.getByRole('article')).toHaveCount(2);

 await page.getByLabel('Cuenta de prueba').selectOption('preview-bakery');
 await expect(page.getByRole('tab')).toHaveCount(1);
 await page.getByRole('button', { name: 'Historial' }).click();
 await expect(page.getByRole('article')).toContainText('Equipo de panadería');
 await expect(page.getByRole('article')).toHaveCount(1);
 await expect(page.getByRole('article').getByText('Administrador de prueba')).toHaveCount(0);
 expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
 expect(errors).toEqual([]);
 expect(remoteRequests).toEqual([]);
});
