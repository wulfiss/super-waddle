import type { Product, Item } from './production.ts';
export const catalogKey='obrador-preview-catalog-v1';
export type ProductDraft={code:string;name:string;unit:string};
export type CatalogChange={action:'save';draft:ProductDraft;id?:string;revision?:number}|{action:'remove';id:string;revision:number};
export function changeCatalog(catalog:Product[],role:unknown,change:CatalogChange):Product[]{
 if(role!=='admin')throw new Error('Solo administración puede modificar productos.');
 const previous=change.id ? catalog.find(product=>product.id===change.id && product.active!==false) : undefined;
 if(change.id && !previous)throw new Error('El producto ya no está disponible.');
 if(previous && (previous.revision ?? 1)!==change.revision)throw new Error('El producto cambió. Actualizá el catálogo y volvé a abrirlo.');
 let product:Product;
 if(change.action==='remove')product={...previous!,active:false,revision:(previous!.revision ?? 1)+1};
 else{
  const draft={code:change.draft.code.trim(),name:change.draft.name.trim(),unit:change.draft.unit.trim()};
  if(!draft.code || !draft.name || !draft.unit || draft.code.length>80 || draft.name.length>160 || draft.unit.length>40)throw new Error('Ingresá un código, nombre y unidad válidos.');
  if(catalog.some(product=>product.id!==change.id && (product.code?.trim().toLowerCase()===draft.code.toLowerCase() || product.name.trim().toLowerCase()===draft.name.toLowerCase())))throw new Error('Ya existe un producto con ese código o nombre.');
  product={...draft,id:previous?.id ?? crypto.randomUUID(),active:true,revision:previous ? (previous.revision ?? 1)+1 : 1};
 }
 return previous ? catalog.map(item=>item.id===previous.id?product:item) : [...catalog,product];
}
export function catalogItems(items:Item[],catalog:Product[],previous:Item[]=[]):Item[]{
 return items.map(item=>{
  const saved=previous.find(line=>line.product_id===item.product_id);
  if(saved)return {...saved,quantity:item.quantity};
  const product=catalog.find(product=>product.id===item.product_id && product.active!==false);
  if(!product)throw new Error('Un producto ya no está disponible. Quitalo del pedido antes de guardar.');
  return {product_id:product.id,code:product.code,name:product.name,unit:product.unit,quantity:item.quantity};
 });
}
