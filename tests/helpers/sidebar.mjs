export async function clickSidebar(page,name){
 const menu=page.getByRole('button',{name:'Abrir menú',exact:true});
 if(await menu.isVisible())await menu.click();
 await page.getByRole('button',{name,exact:true}).click();
}

export async function openFromBakeryHome(page, name){
 const home=page.getByRole('navigation',{name:'Opciones de panadería'});
 await home.getByRole('button').filter({has:page.getByText(name,{exact:true})}).click();
}
