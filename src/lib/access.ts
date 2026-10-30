export const roles = ['bakery', 'warehouse', 'admin'] as const;
export type Role = (typeof roles)[number];
export type Screen = 'bakery' | 'warehouse' | 'admin';

export const roleLabels: Record<Role, string> = {
 bakery: 'Personal de panadería', warehouse: 'Personal de depósito', admin: 'Administrador'
};
export const screenLabels: Record<Screen, string> = {
 bakery: 'Panadería', warehouse: 'Depósito', admin: 'Administración'
};
const permissions: Record<Role, readonly Screen[]> = {
 bakery: ['bakery'], warehouse: ['warehouse'], admin: ['bakery', 'warehouse', 'admin']
};
export function isRole(value: unknown): value is Role {
 return typeof value === 'string' && roles.some(role => role === value);
}
export function screensFor(role: unknown): readonly Screen[] {
 return isRole(role) ? permissions[role] : [];
}
export function canAccess(role: unknown, screen: Screen): boolean {
 return screensFor(role).includes(screen);
}
export function homeScreen(role: Role): Screen {
 return role === 'admin' ? 'admin' : role;
}
