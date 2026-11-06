import { z } from 'zod'

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email.').max(200),
  password: z.string().min(1, 'Enter your password.').max(200),
  /** Which login page was used: the admin panel or the owner portal. */
  portal: z.enum(['admin', 'owner']).default('admin'),
})
export type LoginBody = z.infer<typeof loginBody>

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
})
