export async function openField(page,name){
 const field=page.getByLabel(name,{exact:true});
 if(!await field.isVisible()){
  const panel=field.locator('xpath=ancestor::details[1]');
  if(await panel.count())await panel.locator(':scope > summary').click();
 }
 return field;
}
