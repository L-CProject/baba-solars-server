import type { Request, Response } from 'express'
import { idParam, noContent, ok } from '../../lib/http'
import { createUserBody, resetPasswordBody, updateUserBody } from './users.schema'
import { usersService as s } from './users.service'

export const usersController = {
  list: async (_req: Request, res: Response) => ok(res, await s.list()),
  create: async (req: Request, res: Response) => ok(res, await s.create(createUserBody.parse(req.body)), 201),
  update: async (req: Request, res: Response) => ok(res, await s.update(idParam.parse(req.params).id, updateUserBody.parse(req.body), req.user!.id)),
  async resetPassword(req: Request, res: Response) {
    await s.resetPassword(idParam.parse(req.params).id, resetPasswordBody.parse(req.body).password)
    return noContent(res)
  },
}
