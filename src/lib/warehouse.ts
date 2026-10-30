import type { Production } from './production.ts';
export function isRegistered(order:Production) {return order.registered_revision === (order.revision ?? 1);}
export async function orderWorkbook(order:Production):Promise<ArrayBuffer> {
 const {default:ExcelJS}=await import('exceljs');
 const workbook=new ExcelJS.Workbook();
 const sheet=workbook.addWorksheet('Pedido');
 sheet.addRow(['Pedido',order.id]);sheet.addRow(['Fecha',order.date]);sheet.addRow(['Responsable',order.responsible]);
 sheet.addRow(['Estado',isRegistered(order)?'Registrado':'Pendiente de registrar']);sheet.addRow(['Revisión',order.revision ?? 1]);
 sheet.addRow([]);sheet.addRow(['Código','Producto','Cantidad','Unidad']);
 for(const item of order.items)sheet.addRow([item.code ?? '',item.name,item.quantity,item.unit]);
 sheet.columns=[{width:25},{width:40},{width:18},{width:18}];sheet.getRow(7).font={bold:true};
 return await workbook.xlsx.writeBuffer() as ArrayBuffer;
}
export async function downloadOrder(order:Production) {
 const buffer=await orderWorkbook(order);
 const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const link=document.createElement('a');link.href=url;link.download=`pedido-${order.id}.xlsx`;link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
