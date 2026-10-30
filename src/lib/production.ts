export type Product = { id: string; name: string; unit: string };
export type Item = { product_id: string; name: string; unit: string; quantity: number };
export type Production = { id: string; date: string; responsible: string; items: Item[] };
export const demoProducts: Product[] = [
 {id:'pan',name:'Pan de campo',unit:'unidades'}, {id:'medialunas',name:'Medialunas',unit:'docenas'},
 {id:'masa',name:'Masa para pizza',unit:'kg'}, {id:'salsa',name:'Salsa de tomate',unit:'litros'},
 {id:'empanadas',name:'Empanadas',unit:'unidades'}, {id:'budin',name:'Budín de limón',unit:'unidades'}
];
export function today() { const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); return ['year','month','day'].map(k=>parts.find(p=>p.type===k)?.value).join('-'); }
export function validate(date:string, responsible:string, items:Item[]) {
 const parsed = new Date(date);
 if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) return 'Ingresá una fecha válida.';
 if (!responsible.trim()) return 'Ingresá el nombre del responsable.';
 if (responsible.trim().length > 120) return 'El nombre del responsable no puede superar los 120 caracteres.';
 if (!items.length) return 'Agregá al menos un producto.';
 if(items.some(i=>!Number.isFinite(i.quantity)||i.quantity<=0)) return 'Todas las cantidades deben ser mayores que cero.';
 return '';
}
