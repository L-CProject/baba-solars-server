import type { PlanTiersContent, Quality } from '@/types'

/** Validation for the Normal / Premium plan text. */
export function validatePlanTiers(t: PlanTiersContent): Record<string, string> {
  const e: Record<string, string> = {}
  for (const q of ['normal', 'premium'] as Quality[]) {
    if (!t[q].name.trim()) e[`${q}.name`] = 'Enter the plan name.'
    if (!t[q].features.filter((f) => f.trim()).length) e[`${q}.features`] = 'Add at least one feature.'
    t[q].features.forEach((f, i) => { if (!f.trim()) e[`${q}.features.${i}`] = 'Empty feature — remove it or add text.' })
  }
  if (!t.title.trim()) e.title = 'Enter a heading.'
  t.rows.forEach((r, i) => { if (!r.label.trim()) e[`rows.${i}.label`] = 'Enter the feature name.' })
  return e
}

