export async function openField(page,name){
 const field=page.getByLabel(name,{exact:true});
 if(!await field.isVisible()){
  const panel=field.locator('xpath=ancestor::details[1]');
  if(await panel.count())await panel.locator(':scope > summary').click();
 }
 return field;
}

export async function chooseIngredient(page,index,choice){
 const group=page.getByRole('radiogroup',{name:`Materia prima ${index} (elegí una)`,exact:true,includeHidden:true});
 if(!await group.isVisible())await group.locator('xpath=ancestor::details[1]').locator(':scope > summary').click();
 await group.getByRole('radio').nth(choice).check();
}
