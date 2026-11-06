import type { Permission, Role } from '@/types'

/**
 * Role → permissions. The backend (server/src/lib/rbac.ts imports this file) enforces it on every
 * request; the frontend only uses it to hide what a role cannot do.
 * The owner monitors leads and reports and sees nothing else (no settings, users, backups or prices).
 */
export const PERMISSIONS: Record<Permission, Role[]> = {
  'content:read': ['admin', 'editor', 'sales'],
  'content:write': ['admin', 'editor'],
  'uploads:write': ['admin', 'editor', 'sales'],
  'leads:read': ['admin', 'sales', 'owner'],
  'leads:write': ['admin', 'sales'],
  'leads:delete': ['admin'],
  'leads:assign': ['admin'],
  'reports:read': ['admin', 'owner'],
  'companies:read': ['admin', 'sales', 'editor'],
  'companies:write': ['admin', 'sales'],
  'quotations:read': ['admin', 'sales'],
  'quotations:write': ['admin', 'sales'],
  'invoices:read': ['admin', 'sales'],
  'invoices:write': ['admin', 'sales'],
  'invoices:delete': ['admin'],
  'business:read': ['admin', 'sales', 'editor'],
  'business:write': ['admin'],
  'users:manage': ['admin'],
  'backup:manage': ['admin'],
}
export const permissionsFor = (role: Role): Permission[] => (Object.keys(PERMISSIONS) as Permission[]).filter((p) => PERMISSIONS[p].includes(role))

export const ROLES: Array<{ value: Role; label: string; description: string }> = [
  { value: 'admin', label: 'Admin', description: 'Everything, including users, settings and backups.' },
  { value: 'owner', label: 'Owner', description: 'Owner portal: monitor every enquiry, lead status and reports (read-only).' },
  { value: 'sales', label: 'Sales', description: 'Enquiries, follow-ups, proposals, quotations and billing.' },
  { value: 'editor', label: 'Editor', description: 'Website content only.' },
]
