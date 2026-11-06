import type { Request, Response } from 'express'
import type { EnquiryStatus } from '@/types'
import { idParam, noContent, ok } from '../../lib/http'
import {
  activityBody, assignBody, enquirySaveBody, exportBody, followUpBody, followUpParams, followUpUpdateBody, importBody, listEnquiriesQuery,
  publicEnquiryBody, quoteRequestBody, saveQuery, statusBody,
} from './enquiries.schema'
import { enquiriesService as s } from './enquiries.service'

/** A filled honeypot means a bot: answer like a success, store nothing. */
const botReply = (res: Response) => ok(res, { id: 'received', status: 'new' }, 201)

export const enquiriesController = {
  // Website
  async submitPublic(req: Request, res: Response) {
    const body = publicEnquiryBody.parse(req.body)
    if (body.website) return botReply(res)
    return ok(res, await s.submitPublic(body), 201)
  },
  async submitQuoteRequest(req: Request, res: Response) {
    const body = quoteRequestBody.parse(req.body)
    if (body.website) return botReply(res)
    return ok(res, await s.submitQuoteRequest(body), 201)
  },
  // Staff
  list: async (req: Request, res: Response) => ok(res, await s.list(listEnquiriesQuery.parse(req.query), req.user!)),
  stats: async (_req: Request, res: Response) => ok(res, await s.stats()),
  /** Every active enquiry (customer picker, duplicate check). Use the paginated list for tables. */
  all: async (_req: Request, res: Response) => ok(res, await s.all()),
  assignable: async (_req: Request, res: Response) => ok(res, await s.assignableUsers()),
  get: async (req: Request, res: Response) => ok(res, await s.get(idParam.parse(req.params).id)),
  async create(req: Request, res: Response) {
    const body = enquirySaveBody.parse(req.body)
    return ok(res, await s.save(body, req.user!, saveQuery.parse(req.query)), 201)
  },
  async update(req: Request, res: Response) {
    const { id } = idParam.parse(req.params)
    const body = enquirySaveBody.parse(req.body)
    return ok(res, await s.save({ ...body, id }, req.user!, saveQuery.parse(req.query)))
  },
  async setStatus(req: Request, res: Response) {
    const body = statusBody.parse(req.body)
    return ok(res, await s.setStatus(idParam.parse(req.params).id, { ...body, status: body.status as EnquiryStatus }, req.user!))
  },
  async assign(req: Request, res: Response) {
    const body = assignBody.parse(req.body)
    return ok(res, await s.assign(idParam.parse(req.params).id, body.userId, body.note, req.user!))
  },
  async logActivity(req: Request, res: Response) {
    const body = activityBody.parse(req.body)
    return ok(res, await s.logActivity(idParam.parse(req.params).id, { ...body, status: body.status as EnquiryStatus | undefined }, req.user!), 201)
  },
  async scheduleFollowUp(req: Request, res: Response) {
    return ok(res, await s.scheduleFollowUp(idParam.parse(req.params).id, followUpBody.parse(req.body), req.user!), 201)
  },
  async completeFollowUp(req: Request, res: Response) {
    const p = followUpParams.parse(req.params)
    return ok(res, await s.completeFollowUp(p.id, p.followUpId, followUpUpdateBody.parse(req.body), req.user!))
  },
  async remove(req: Request, res: Response) {
    await s.remove(idParam.parse(req.params).id, req.user!)
    return noContent(res)
  },
  importRows: async (req: Request, res: Response) => ok(res, await s.importRows(importBody.parse(req.body).rows, req.user!)),
  exportRows: async (req: Request, res: Response) => ok(res, await s.byIds(exportBody.parse(req.body).ids)),
}
