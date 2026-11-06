import type { CalculatorSettings, FieldErrors } from '@/types'
import { validateSubsidySettings } from '@/lib/subsidy'

/**
 * Rules for Settings → Calculator (tariff slabs, generation factors, cost slabs, subsidy).
 * Shared by the backend (server/) and the admin form. Keys are field paths under `calculator.`.
 */
export function validateCalculatorSettings(c: CalculatorSettings): FieldErrors {
  const errors: FieldErrors = {}
  if (!(c.unitsPerKwPerDay > 0 && c.unitsPerKwPerDay <= 8))
    errors['calculator.unitsPerKwPerDay'] =
      'Use a value between 0 and 8.';
  if (!(c.defaultTariff > 0))
    errors['calculator.defaultTariff'] = 'Tariff must be more than 0.';
  const el = c.electricity;
  if (el) {
    const slabSets = [
      'domesticEnergy',
      'lv21Energy',
      'lv22SmallEnergy',
      'lv22LargeEnergy',
      'lv5SmallEnergy',
      'lv5LargeEnergy',
    ] as const;
    for (const key of slabSets) {
      let prev = 0;
      el[key].forEach((sl, i) => {
        if (!(sl.rate > 0))
          errors[`calculator.electricity.${key}.${i}.rate`] =
            'Rate must be more than 0.';
        if (sl.upToUnits !== null && sl.upToUnits <= prev)
          errors[`calculator.electricity.${key}.${i}.upToUnits`] =
            'Slabs must go up.';
        if (sl.upToUnits !== null) prev = sl.upToUnits;
      });
    }
    for (const key of [
      'fppasPercent',
      'dutyDomesticPercent',
      'dutyNonDomesticPercent',
      'dutyIndustrialPercent',
    ] as const)
      if (!(el[key] >= 0 && el[key] <= 100))
        errors[`calculator.electricity.${key}`] =
          'Use a percentage between 0 and 100.';
    if (!(el.halfBill.percent >= 0 && el.halfBill.percent <= 100))
      errors['calculator.electricity.halfBill.percent'] =
        'Use a percentage between 0 and 100.';
    if (el.halfBill.unitsCovered > el.halfBill.maxUnits)
      errors['calculator.electricity.halfBill.unitsCovered'] =
        'Cannot be more than the eligibility limit.';
    if (!(el.defaultLoadKw.domestic > 0 && el.defaultLoadKw.commercial > 0))
      errors['calculator.electricity.defaultLoadKw.domestic'] =
        'Default loads must be more than 0.';
  }
  const g = c.generation;
  if (g) {
    for (const [k, v] of Object.entries(g.orientation ?? {}))
      if (!(v > 0 && v <= 1.2)) errors[`calculator.generation.orientation.${k}`] = 'Use a factor between 0 and 1.2.';
    for (const [k, v] of Object.entries(g.shading ?? {}))
      if (!(v > 0 && v <= 1)) errors[`calculator.generation.shading.${k}`] = 'Use a factor between 0 and 1.';
    if (!(g.extraLossPercent >= 0 && g.extraLossPercent < 90))
      errors['calculator.generation.extraLossPercent'] = 'Use 0–89%.';
    for (const [k, v] of Object.entries(g.yieldByState ?? {}))
      if (!(v > 0 && v <= 8)) errors['calculator.generation.yieldByState'] = `Units/kW/day for state ${k} must be between 0 and 8.`;
  }
  for (const k of ['residential', 'commercial', 'industrial'] as const)
    if (!(c.indicativeTariff?.[k] > 0 && c.indicativeTariff[k] <= 50))
      errors[`calculator.indicativeTariff.${k}`] = 'Use ₹0–50 per unit.';
  let last = 0;
  c.costSlabs.forEach((s, i) => {
    if (!(s.pricePerKw > 0))
      errors[`calculator.costSlabs.${i}.pricePerKw`] =
        'Price must be more than 0.';
    if (s.upToKw !== null && s.upToKw <= last)
      errors[`calculator.costSlabs.${i}.upToKw`] =
        'Slabs must go up in size.';
    if (s.upToKw === null && i < c.costSlabs.length - 1)
      errors[`calculator.costSlabs.${i}.upToKw`] =
        'Only the last slab can be open-ended.';
    if (s.upToKw !== null) last = s.upToKw;
  });
  Object.assign(errors, validateSubsidySettings(c.subsidy));
  return errors
}
