import { z } from 'zod'

const role = z.enum(['admin', 'owner', 'sales', 'editor'])
export const createUserBody = z.object({
  name: z.string().trim().min(2, 'Enter the name.').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email.').max(200),
  role,
  password: z.string().max(200),
  isActive: z.boolean().default(true),
})
export const updateUserBody = z.object({
  name: z.string().trim().min(2, 'Enter the name.').max(120).optional(),
  email: z.string().trim().toLowerCase().email('Enter a valid email.').max(200).optional(),
  role: role.optional(),
  isActive: z.boolean().optional(),
})
export const resetPasswordBody = z.object({ password: z.string().max(200) })
