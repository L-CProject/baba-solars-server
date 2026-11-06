import type { Request, Response } from 'express'
import type { CalculatorInput } from '@/lib/calculator'
import { ok } from '../../lib/http'
import { estimateBody } from './calculator.schema'
import { calculatorService as s } from './calculator.service'

export const calculatorController = {
  estimate: async (req: Request, res: Response) => ok(res, await s.estimate(estimateBody.parse(req.body) as CalculatorInput)),
}
