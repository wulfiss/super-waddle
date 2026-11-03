import{test,expect}from'@playwright/test';
test('order validation visibly explains missing responsible and invalid quantities',async({page})=>{
 await page.goto('/');const save=page.getByRole('button',{name:/^Guardar pedido/});await expect(save).toBeEnabled();
 const responsible=page.getByLabel('Responsable',{exact:true});await responsible.fill('');await save.click();
 await expect(page.locator('#responsible-error')).toBeVisible();await expect(responsible).toBeFocused();await expect(responsible).toHaveAttribute('aria-invalid','true');
 await expect(page.getByRole('dialog',{name:'Revisá tu pedido'})).not.toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('obrador-preview-workspace-v1'))).toBeNull();
 await responsible.fill('   ');await save.click();await expect(page.locator('#responsible-error')).toBeVisible();
 await responsible.fill('María');await expect(page.locator('#responsible-error')).toHaveCount(0);await save.click();await expect(page.locator('#page-error')).toContainText('Agregá al menos un producto');
 const catalog=page.getByRole('region',{name:'Productos disponibles'});await expect(catalog.locator('small')).toHaveCount(0);
 await page.getByRole('button',{name:'Pan de campo unidades',exact:true}).click();await expect(page.locator('.selected small')).toHaveCount(0);
 const quantity=page.getByLabel('Cantidad de Pan de campo',{exact:true});await expect(quantity).toHaveValue('');await save.click();await expect(page.locator('#page-error')).toContainText('cantidades');await quantity.fill('0');await save.click();await expect(page.locator('#page-error')).toContainText('cantidades');
 await quantity.fill('2');await save.click();await expect(page.getByRole('dialog',{name:'Revisá tu pedido'})).toBeVisible();
 await page.getByRole('button',{name:'Volver a editar',exact:true}).click();await expect(quantity).toHaveValue('2');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
test('product window retains four readable rows on mobile and desktop',async({page},testInfo)=>{
 await page.goto('/');const catalog=page.getByRole('region',{name:'Productos disponibles'});await expect(catalog.getByRole('button')).toHaveCount(6);await catalog.scrollIntoViewIfNeeded();
 const layout=await catalog.evaluate(e=>{const box=e.getBoundingClientRect();const buttons=[...e.querySelectorAll('button')];return{shown:buttons.filter(b=>{const r=b.getBoundingClientRect();return r.top>=box.top&&r.bottom<=box.bottom;}).length,font:parseFloat(getComputedStyle(buttons[0]).fontSize),height:box.height};});
 expect(layout.shown).toBe(4);if(testInfo.project.name.includes('mobile'))expect(layout.font).toBeGreaterThanOrEqual(16);
});
