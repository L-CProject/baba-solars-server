import type { Request, Response } from 'express'
import type { BusinessSettings } from '@/types'
import { ok } from '../../lib/http'
import { businessPatch } from './business.schema'
import { businessService as s } from './business.service'

export const businessController = {
  get: async (_req: Request, res: Response) => ok(res, await s.get()),
  update: async (req: Request, res: Response) => ok(res, await s.update(businessPatch.parse(req.body) as Partial<BusinessSettings>, req.user!.id)),
}
