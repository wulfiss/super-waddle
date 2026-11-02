export type Product = { id: string; name: string; unit: string; code?: string | null; active?:boolean; revision?:number };
export type Item = { product_id: string; name: string; unit: string; code?: string | null; quantity: number };
export type Production = { id: string; date: string; responsible: string; items: Item[]; user_id?: string; status?: 'active' | 'cancelled'; revision?: number; registered_revision?: number | null; kind?: 'regular' | 'extra' };
export const demoProducts: Product[] = [
 {id:'pan',code:'DEMO-001',name:'Pan de campo',unit:'unidades'}, {id:'medialunas',code:'DEMO-002',name:'Medialunas',unit:'docenas'},
 {id:'masa',code:'DEMO-003',name:'Masa para pizza',unit:'kg'}, {id:'salsa',code:'DEMO-004',name:'Salsa de tomate',unit:'litros'},
 {id:'empanadas',code:'DEMO-005',name:'Empanadas',unit:'unidades'}, {id:'budin',code:'DEMO-006',name:'Budín de limón',unit:'unidades'}
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
