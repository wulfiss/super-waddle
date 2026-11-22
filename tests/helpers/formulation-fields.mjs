import {expect} from '@playwright/test';

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

export async function correctField(page, message, field){
 const notice=page.getByRole('alertdialog',{name:'Revisá este dato'});
 await expect(notice).toBeInViewport();
 await expect(notice).toHaveAccessibleDescription(message);
 await notice.getByRole('button',{name:'Ir al campo'}).click();
 await expect(field).toBeFocused();
 await expect(field).toBeInViewport();
}
