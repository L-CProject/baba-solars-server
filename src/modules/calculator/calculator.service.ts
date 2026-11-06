import { calculateSolar, validateCalculatorInput, type CalculatorInput } from '@/lib/calculator'
import { assertValid } from '../../lib/errors'
import { loadContent } from '../content/settings.repo'

/** Server-side solar estimate with the live calculator settings (same engine as the website). */
export const calculatorService = {
  async estimate(input: CalculatorInput) {
    assertValid(validateCalculatorInput(input) as Record<string, string>, 'Check the calculator inputs.')
    const { calculator } = await loadContent()
    return calculateSolar(input, calculator)
  },
}
