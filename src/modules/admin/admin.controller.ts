import type { Request, Response } from 'express'
import { noContent, ok } from '../../lib/http'
import { can } from '../../lib/access'
import { analyticsQuery, exportQuery, resetBody, restoreBody } from './admin.schema'
import { dashboardService } from './dashboard.service'
import { adminService as s } from './admin.service'

export const adminController = {
  async dashboard(req: Request, res: Response) {
    const role = req.user!.role
    return ok(res, await s.dashboard({ leads: can(role, 'leads:read'), quotations: can(role, 'quotations:read'), invoices: can(role, 'invoices:read') }))
  },
  async analytics(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    return ok(res, await dashboardService.analytics(analyticsQuery.parse(req.query)))
  },
  async exportBackup(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    return ok(res, await s.exportSnapshot(exportQuery.parse(req.query).includeLeads))
  },
  restore: async (req: Request, res: Response) => ok(res, await s.restore(restoreBody.parse(req.body), req.user!.id)),
  async reset(req: Request, res: Response) {
    resetBody.parse(req.body)
    await s.resetWebsite(req.user!.id)
    return noContent(res)
  },
}
