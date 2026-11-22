import { productCategories, type Item, type Production, type ProductCategory } from './production.ts';
export function isRegistered(order:Production) {return order.registered_revision === (order.revision ?? 1);}
export function groupOrderItems(items:Item[]) {
 const grouped:Record<ProductCategory,Item[]>={materia_prima:[],insumos:[]};
 for(const item of items)grouped[item.category ?? 'materia_prima'].push(item);
 return (Object.keys(productCategories) as ProductCategory[]).map(category=>({
  category,label:productCategories[category],items:grouped[category]
 }));
}
export async function orderWorkbook(order:Production):Promise<ArrayBuffer> {
 const {default:ExcelJS}=await import('exceljs');
 const workbook=new ExcelJS.Workbook();
 const sheet=workbook.addWorksheet('Pedido');
 sheet.addRow(['Pedido',order.id]);sheet.addRow(['Fecha',order.date]);sheet.addRow(['Responsable',order.responsible]);
 sheet.addRow(['Estado',isRegistered(order)?'Registrado':'Pendiente de registrar']);sheet.addRow(['Revisión',order.revision ?? 1]);
 for(const group of groupOrderItems(order.items)){
  sheet.addRow([]);
  sheet.addRow([group.label]).font={bold:true};
  if(group.items.length){
   sheet.addRow(['Código','Producto','Cantidad','Unidad']).font={bold:true};
   for(const item of group.items)sheet.addRow([item.code ?? '',item.name,item.quantity,item.unit]);
  }else sheet.addRow(['Sin productos']);
 }
 sheet.addRow([]);sheet.addRow(['Tipo de pedido',order.kind==='extra'?'Extra':'Regular']);
 sheet.columns=[{width:25},{width:40},{width:18},{width:18}];
 return await workbook.xlsx.writeBuffer() as ArrayBuffer;
}
export async function downloadOrder(order:Production) {
 const buffer=await orderWorkbook(order);
 const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const link=document.createElement('a');link.href=url;link.download=`pedido-${order.id}.xlsx`;link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
