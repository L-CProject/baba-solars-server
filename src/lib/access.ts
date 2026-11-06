import type { Permission, Role } from '@/types'
import { PERMISSIONS, permissionsFor } from '@/lib/rbac'

/** Same role → permission table as the website (src/lib/rbac.ts); enforced here on every request. */
export { PERMISSIONS, permissionsFor }
export const ROLE_KEYS: Role[] = ['admin', 'owner', 'sales', 'editor']
export const can = (role: Role, p: Permission) => PERMISSIONS[p].includes(role)
/** Which login page each role uses. */
export const portalFor = (role: Role): 'admin' | 'owner' => (role === 'owner' ? 'owner' : 'admin')
