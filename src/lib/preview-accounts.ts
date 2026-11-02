import type { Role } from './access.ts';
import type { Production } from './production.ts';

export type PreviewAccount = { id: string; name: string; role: Role };
export const previewAccounts: readonly PreviewAccount[] = [
 { id: 'preview-bakery', name: 'Equipo de panadería', role: 'bakery' },
 { id: 'preview-warehouse', name: 'Equipo de depósito', role: 'warehouse' },
 { id: 'preview-admin', name: 'Administrador de prueba', role: 'admin' }
];
export const defaultPreviewAccount = previewAccounts[0];
export function findPreviewAccount(id: unknown): PreviewAccount | undefined {
 return previewAccounts.find(account => account.id === id);
}
export function previewHistory(records: Production[], account: PreviewAccount): Production[] {
 const active = records.filter(record => record.status !== 'cancelled');
 if (account.role !== 'bakery') return active;
 // Orders saved before test accounts existed belong to the original bakery account.
 return active.filter(record => (record.user_id ?? defaultPreviewAccount.id) === account.id);
}
