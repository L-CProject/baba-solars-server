import type { Request, Response } from 'express'
import { ok } from '../../lib/http'
import { ownerDashboardQuery } from './owner.schema'
import { ownerService as s } from './owner.service'

export const ownerController = {
  dashboard: async (req: Request, res: Response) => ok(res, await s.dashboard(ownerDashboardQuery.parse(req.query).limit)),
}
