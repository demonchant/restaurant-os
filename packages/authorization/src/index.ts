import type { Principal } from '@restaurant-os/types';

export const permissions = {
  tenantRead: 'tenant:read', staffView: 'staff:view', staffCreate: 'staff:create', staffUpdate: 'staff:update', staffSuspend: 'staff:suspend', staffRolesAssign: 'staff:roles:assign', staffSessionsRevoke: 'staff:sessions:revoke',
  rolesView: 'roles:view', permissionsView: 'permissions:view', auditRead: 'audit:view', settingsView: 'settings:view', settingsUpdate: 'settings:update', restaurantView: 'restaurant:view', restaurantUpdate: 'restaurant:update', locationsView: 'locations:view', locationsCreate: 'locations:create', locationsUpdate: 'locations:update', staffLocationsAssign: 'staff:locations:assign', devicesView: 'devices:view', devicesManage: 'devices:manage',
  ordersView: 'orders:view', ordersCreate: 'orders:create', ordersUpdate: 'orders:update', ordersCancel: 'orders:cancel', menuView: 'menu:view', menuCreate: 'menu:create', menuUpdate: 'menu:update', menuPublish: 'menu:publish',
  pricingView: 'pricing:view', pricingUpdate: 'pricing:update', inventoryView: 'inventory:view', inventoryUpdate: 'inventory:update', inventoryAdjust: 'inventory:adjust', paymentsView: 'payments:view', paymentsReconcile: 'payments:reconcile',
  refundsCreate: 'refunds:create', refundsReview: 'refunds:review', refundsApprove: 'refunds:approve', discountsView: 'discounts:view', discountsCreate: 'discounts:create', discountsApprove: 'discounts:approve', reportsView: 'reports:view',
  deliveryView: 'delivery:view', deliveryManage: 'delivery:manage', aiView: 'ai:view', aiConfigure: 'ai:configure', systemConfigure: 'system:configure',
} as const;

export type PermissionCode = (typeof permissions)[keyof typeof permissions];
export const permissionRegistry: ReadonlyArray<{ code: PermissionCode; description: string }> = Object.values(permissions).map((code) => ({ code, description: code.replaceAll(':', ' ') }));
export const systemRoleCodes = ['OWNER', 'ADMIN', 'MANAGER', 'FOH', 'KITCHEN', 'PACKING', 'DELIVERY'] as const;
export type SystemRoleCode = (typeof systemRoleCodes)[number];
export const roleRank: Readonly<Record<SystemRoleCode, number>> = { OWNER: 100, ADMIN: 80, MANAGER: 60, FOH: 20, KITCHEN: 20, PACKING: 20, DELIVERY: 20 };

export const initialRolePermissions: Readonly<Record<SystemRoleCode, readonly PermissionCode[]>> = {
  OWNER: Object.values(permissions),
  ADMIN: [permissions.tenantRead, permissions.staffView, permissions.staffCreate, permissions.staffUpdate, permissions.staffSuspend, permissions.staffRolesAssign, permissions.staffSessionsRevoke, permissions.rolesView, permissions.permissionsView, permissions.auditRead, permissions.settingsView, permissions.settingsUpdate, permissions.restaurantView, permissions.restaurantUpdate, permissions.locationsView, permissions.locationsCreate, permissions.locationsUpdate, permissions.staffLocationsAssign, permissions.devicesView, permissions.devicesManage,permissions.menuView,permissions.menuCreate,permissions.menuUpdate,permissions.menuPublish,permissions.pricingView,permissions.pricingUpdate],
  MANAGER: [permissions.tenantRead, permissions.staffView, permissions.staffCreate, permissions.staffUpdate, permissions.staffSuspend, permissions.staffRolesAssign, permissions.staffSessionsRevoke, permissions.rolesView, permissions.permissionsView, permissions.restaurantView, permissions.locationsView, permissions.locationsUpdate, permissions.staffLocationsAssign, permissions.devicesView, permissions.devicesManage,permissions.menuView,permissions.menuUpdate,permissions.pricingView],
  FOH: [permissions.restaurantView, permissions.locationsView,permissions.menuView,permissions.pricingView], KITCHEN: [permissions.restaurantView, permissions.locationsView,permissions.menuView], PACKING: [permissions.restaurantView, permissions.locationsView,permissions.menuView], DELIVERY: [permissions.restaurantView, permissions.locationsView],
};

export class AuthorizationError extends Error {
  constructor(message = 'The requested operation is not permitted') { super(message); this.name = 'AuthorizationError'; }
}

export interface ResourceScope { tenantId: string; locationId?: string; }
export function authorize(principal: Principal, permission: string, resource: ResourceScope): void {
  if (principal.kind !== 'STAFF' || principal.tenantId !== resource.tenantId || !principal.permissions.has(permission)) throw new AuthorizationError();
  if (resource.locationId && principal.locationScope !== 'TENANT' && !(principal.locationScope === 'LOCATIONS' && principal.locationIds.has(resource.locationId))) throw new AuthorizationError();
}
export function requirePermission(principal: Principal, permission: string): void { if (!principal.permissions.has(permission)) throw new AuthorizationError(); }
export function requireTenant(principal: Principal, resourceTenantId: string): void { if (principal.tenantId !== resourceTenantId) throw new AuthorizationError(); }
export function requireAssurance(principal: Principal, minimum: number): void { if (principal.assuranceLevel < minimum) throw new AuthorizationError('Stronger authentication is required'); }
export function maximumRoleRank(roleCodes: ReadonlySet<string>): number { return Math.max(0, ...[...roleCodes].map((code) => roleRank[code as SystemRoleCode] ?? 0)); }
