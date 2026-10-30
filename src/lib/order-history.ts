import { validate, type Production, type Item } from './production.ts';
import { defaultPreviewAccount, type PreviewAccount } from './preview-accounts.ts';
import type { Role } from './access.ts';

export type OrderDraft = { date: string; responsible: string; items: Item[] };
export type AuditAction = 'created' | 'edited' | 'cancelled' | 'registered' | 'unregistered';
export type AuditEntry = {
 id: string; production_id: string; action: AuditAction; actor_id: string;
 actor_name: string; actor_role: Role; occurred_at: string;
 before_snapshot: Production | null; after_snapshot: Production;
};
export type PreviewWorkspace = { orders: Production[]; audit: AuditEntry[] };
export const workspaceKey = 'obrador-preview-workspace-v1';
export const auditLabels: Record<AuditAction, string> = { created:'Pedido creado', edited:'Pedido editado', cancelled:'Pedido eliminado',registered:'Pedido registrado',unregistered:'Registro desmarcado' };
type Change = { action:'created'; draft:OrderDraft }
 | { action:'edited'; id:string; revision:number; draft:OrderDraft }
 | { action:'cancelled' | 'registered' | 'unregistered'; id:string; revision:number };

// One localStorage write commits both orders and audit, without partial saves.
export function changePreviewOrder(workspace: PreviewWorkspace, actor: PreviewAccount, change: Change): PreviewWorkspace {
 const registration=change.action==='registered' || change.action==='unregistered';
 if(registration ? actor.role!=='warehouse' && actor.role!=='admin' : actor.role !== 'bakery' && actor.role !== 'admin') throw new Error('Bakery access required');
 let before: Production | null = null;
 if(change.action !== 'created') {
  const record = workspace.orders.find(order => order.id === change.id && order.status !== 'cancelled');
  if(!record || (!registration && actor.role !== 'admin' && (record.user_id ?? defaultPreviewAccount.id) !== actor.id)) throw new Error('Order unavailable');
  if((record.revision ?? 1) !== change.revision) throw new Error('Order revision changed');
  before = structuredClone(record);
 }
 if('draft' in change) {
  const error=validate(change.draft.date,change.draft.responsible,change.draft.items);
  if(error) throw new Error(error);
  if(new Set(change.draft.items.map(item=>item.product_id)).size !== change.draft.items.length) throw new Error('Duplicate products');
 }
 const after: Production = registration ? {...before!,registered_revision:change.action==='registered' ? before!.revision ?? 1 : null} : change.action === 'cancelled' ? {...before!,status:'cancelled',revision:(before!.revision ?? 1)+1}
  : {id:before?.id ?? crypto.randomUUID(),user_id:before ? before.user_id ?? defaultPreviewAccount.id : actor.id,
   date:('draft' in change ? change.draft.date : ''),responsible:('draft' in change ? change.draft.responsible.trim() : ''),items:structuredClone('draft' in change ? change.draft.items : []),
   status:'active',revision:before ? (before.revision ?? 1)+1 : 1};
 const entry: AuditEntry = {
  id:crypto.randomUUID(),production_id:after.id,action:change.action,actor_id:actor.id,
  actor_name:actor.name,actor_role:actor.role,occurred_at:new Date().toISOString(),
  before_snapshot:before,after_snapshot:structuredClone(after)
 };
 return {
  orders:change.action === 'created' ? [after,...workspace.orders] : workspace.orders.map(order=>order.id===after.id ? after : order),
  audit:[entry,...workspace.audit]
 };
}

export function describeChanges(entry: AuditEntry): string[] {
 if(entry.action==='registered')return ['Depósito marcó el pedido como registrado.'];
 if(entry.action==='unregistered')return ['Se quitó la marca de registrado.'];
 if(entry.action === 'created') return ['Se creó el pedido.'];
 if(entry.action === 'cancelled') return ['Se quitó el pedido de panadería y depósito.'];
 const before=entry.before_snapshot;
 const after=entry.after_snapshot;
 if(!before) return [];
 const changes:string[]=[];
 if(before.date!==after.date) changes.push(`Fecha: ${before.date.split('-').reverse().join('/')} → ${after.date.split('-').reverse().join('/')}`);
 if(before.responsible!==after.responsible) changes.push(`Responsable: ${before.responsible} → ${after.responsible}`);
 const format=(item:Item)=>`${new Intl.NumberFormat('es-AR').format(item.quantity)} ${item.unit}`;
 for(const item of before.items) {
  const next=after.items.find(line=>line.product_id===item.product_id);
  if(!next) changes.push(`${item.name}: ${format(item)} → quitado`);
  else if(item.quantity!==next.quantity || item.unit!==next.unit || item.name!==next.name) changes.push(`${item.name}: ${format(item)} → ${next.name!==item.name ? next.name+' · ' : ''}${format(next)}`);
 }
 for(const item of after.items) if(!before.items.some(line=>line.product_id===item.product_id)) changes.push(`${item.name}: agregado · ${format(item)}`);
 return changes.length ? changes : ['Se confirmó el pedido sin cambios de contenido.'];
}
