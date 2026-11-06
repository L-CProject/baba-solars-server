import type { Request, Response } from 'express'
import type { ProposalInput } from '@/lib/proposals'
import { idParam, noContent, ok } from '../../lib/http'
import { listProposalsQuery, proposalBody, proposalStatusBody } from './proposals.schema'
import { proposalsService as s } from './proposals.service'

export const proposalsController = {
  list: async (req: Request, res: Response) => ok(res, await s.list(listProposalsQuery.parse(req.query))),
  get: async (req: Request, res: Response) => ok(res, await s.get(idParam.parse(req.params).id)),
  create: async (req: Request, res: Response) => ok(res, await s.save(null, proposalBody.parse(req.body) as unknown as ProposalInput, req.user!), 201),
  update: async (req: Request, res: Response) => ok(res, await s.save(idParam.parse(req.params).id, proposalBody.parse(req.body) as unknown as ProposalInput, req.user!)),
  duplicate: async (req: Request, res: Response) => ok(res, await s.duplicate(idParam.parse(req.params).id), 201),
  setStatus: async (req: Request, res: Response) => ok(res, await s.setStatus(idParam.parse(req.params).id, proposalStatusBody.parse(req.body).status)),
  convert: async (req: Request, res: Response) => ok(res, await s.convert(idParam.parse(req.params).id, req.user!), 201),
  async remove(req: Request, res: Response) {
    await s.remove(idParam.parse(req.params).id)
    return noContent(res)
  },
}
