export async function clickSidebar(page,name){
 const menu=page.getByRole('button',{name:'Abrir menú',exact:true});
 if(await menu.isVisible())await menu.click();
 await page.getByRole('button',{name,exact:true}).click();
}
