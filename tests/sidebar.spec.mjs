import{test,expect}from'@playwright/test';
import{clickSidebar}from'./helpers/sidebar.mjs';
test('mobile hamburger opens the whole sidebar vertically; desktop keeps the sidebar visible',async({page},testInfo)=>{
 await page.goto('/');await expect(page.getByLabel('Cuenta de prueba')).toBeEnabled();
 await page.getByLabel('Cuenta de prueba').selectOption('preview-admin');
 const opener=page.getByRole('button',{name:'Abrir menú',exact:true}),drawer=page.getByRole('dialog',{name:'Menú principal',exact:true});
 if(testInfo.project.name==='mobile'){
  await expect(opener).toBeVisible();await expect(opener).toHaveAttribute('aria-expanded','false');await expect(page.getByRole('navigation',{name:'Administración',exact:true})).not.toBeVisible();
  await opener.click();await expect(drawer).toBeVisible();await expect(opener).toHaveAttribute('aria-expanded','true');
  await expect(drawer.getByRole('link',{name:'p. Picui /'})).toBeVisible();await expect(drawer.getByText('Administrador',{exact:true})).toBeVisible();await expect(drawer.getByText('Entorno de demostración',{exact:false})).toBeVisible();
  const buttons=drawer.getByRole('navigation',{name:'Administración',exact:true}).getByRole('button');
  const boxes=await buttons.evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};}));
  expect(boxes).toHaveLength(3);expect(boxes[1].x).toBe(boxes[0].x);expect(boxes[2].y).toBeGreaterThan(boxes[1].y);expect(boxes[1].y).toBeGreaterThanOrEqual(boxes[0].y+boxes[0].height);
  await page.keyboard.press('Escape');await expect(drawer).not.toBeVisible();await expect(opener).toBeFocused();
  await opener.click();await drawer.getByRole('button',{name:'Cerrar menú',exact:true}).click();await expect(drawer).not.toBeVisible();
  await opener.click();await page.mouse.click(385,400);await expect(drawer).not.toBeVisible();
 }else{
  await expect(opener).not.toBeVisible();await expect(page.getByRole('navigation',{name:'Administración',exact:true})).toBeVisible();await expect(page.getByText('Menú de administración',{exact:true})).toHaveCount(0);
 }
 await clickSidebar(page,'Usuarios');await expect(page.getByRole('heading',{name:'Usuarios',exact:true}).first()).toBeVisible();await expect(drawer).not.toBeVisible();
 if(testInfo.project.name==='mobile'){
  await opener.click();await page.setViewportSize({width:1100,height:800});await expect(drawer).not.toBeVisible();await expect(opener).not.toBeVisible();await expect(page.getByRole('navigation',{name:'Administración',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});await expect(opener).toHaveAttribute('aria-expanded','false');
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
