import{test,expect}from'@playwright/test';
import{clickSidebar}from'./helpers/sidebar.mjs';
test('mobile hamburger opens the whole sidebar vertically; desktop keeps the sidebar visible',async({page},testInfo)=>{
 await page.goto('/');await expect(page.getByLabel('Cuenta de prueba')).toBeEnabled();
 await page.getByLabel('Cuenta de prueba').selectOption('preview-admin');
 const opener=page.getByRole('button',{name:'Abrir menú',exact:true}),drawer=page.getByRole('dialog',{name:'Menú principal',exact:true});
 if(testInfo.project.name==='mobile'){
  await expect(opener).toBeVisible();await expect(opener).toHaveAttribute('aria-expanded','false');await expect(page.getByRole('navigation',{name:'Administración',exact:true})).not.toBeVisible();
  await opener.click();await expect(drawer).toBeVisible();await expect(opener).toHaveAttribute('aria-expanded','true');
  await expect(drawer.getByRole('link',{name:'Picui · Ir al inicio'})).toBeVisible();await expect(drawer.getByText('Administrador',{exact:true})).toBeVisible();await expect(drawer.getByText('Entorno de demostración',{exact:false})).toBeVisible();
  const buttons=drawer.getByRole('navigation',{name:'Administración',exact:true}).getByRole('button');
  const boxes=await buttons.evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};}));
  await expect(buttons).toHaveText(['Administración','Recetas','Historial de elaboraciones','Agregar productos','Usuarios']);
  expect(boxes).toHaveLength(5);for(let i=1;i<boxes.length;i++){expect(boxes[i].x).toBe(boxes[0].x);expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i-1].y+boxes[i-1].height);}
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

test('Picui returns each account to its own home',async({page},testInfo)=>{
 await page.goto('/');
 const brandName='Picui · Ir al inicio';
 const brand=page.locator(testInfo.project.name==='mobile'?'.mobile-topbar':'.desktop-sidebar')
  .getByRole('link',{name:brandName});
 const account=page.getByLabel('Cuenta de prueba');
 await clickSidebar(page,'Elaboraciones');
 await brand.click();
 await expect(page.getByRole('heading',{name:'Inicio',exact:true})).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Opciones de panadería'})).toBeVisible();

 await account.selectOption('preview-warehouse');
 await page.getByLabel('Buscar pedidos').fill('Harina');
 await page.locator('header').getByRole('link',{name:brandName}).click();
 await expect(page.getByRole('heading',{name:'Depósito',exact:true})).toBeVisible();
 await expect(page.getByLabel('Buscar pedidos')).toHaveValue('');

 await account.selectOption('preview-admin');
 for(const workspace of ['Panadería','Depósito']){
  await page.getByRole('tab',{name:workspace,exact:true}).click();
  if(testInfo.project.name==='mobile'){
   await page.getByRole('button',{name:'Abrir menú',exact:true}).click();
   const drawer=page.getByRole('dialog',{name:'Menú principal'});
   await drawer.getByRole('link',{name:brandName}).press('Enter');
   await expect(drawer).toBeHidden();
  }else await brand.press('Enter');
  await expect(page.getByRole('heading',{name:'Espacios de trabajo'})).toBeVisible();
  await expect(account).toHaveValue('preview-admin');
 }
 await clickSidebar(page,'Usuarios');
 await brand.click();
 await expect(page.getByRole('heading',{name:'Espacios de trabajo'})).toBeVisible();
});
