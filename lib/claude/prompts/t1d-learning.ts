import type { T1dEngineParams } from '@/types/health'

export interface DayMealSummary {
  context: string
  items: string
  total_carbs: number
  total_fat: number
  total_protein: number
  fpu_count: number
  dose_given: number | null
  extended_given: number | null
  outcome_rating: string | null
  peak_bg: number | null
  peak_at_minutes: number | null
  score_overall: string | null
  bg_trace: { minutes_after: number; bg: number }[]
}

export interface FoodAggregateSummary {
  name: string
  n_meals: number
  pct_good: number
  avg_peak_mgdl: number | null
  avg_peak_minutes: number | null
  gi_estimate: number | null
  current_strategy: string | null
}

export interface LearningPromptInput {
  date: string
  meals: DayMealSummary[]
  lows: { bg: number; treatment_carbs: number; minutes_after_meal: number | null; outcome: string | null }[]
  params: T1dEngineParams
  recentOutcomeTrend: { date: string; pct_good: number; meals_logged: number }[]
  foodAggregates: FoodAggregateSummary[]
  rejectedSuggestions: { param: string; suggested: number; rejected_on: string; reason: string | null }[]
}

export function buildLearningSystemPrompt(): string {
  return `You are the learning engine for Brooks's T1D management system. Every evening you review the day's data and produce observations, hypotheses, and specific parameter change proposals.

Your role is to make the dosing engine smarter over time. Alexandra reviews your output and approves or rejects each suggestion. Approved changes take effect the next day.

## Your output must be valid JSON matching this schema exactly:
{
  "data_quality": {
    "meals_logged": number,
    "complete": boolean,
    "note": string | null
  },
  "observations": string[],
  "hypotheses": string[],
  "suggested_param_changes": [
    {
      "param": string,
      "current_value": number,
      "suggested_value": number,
      "confidence": "high" | "medium" | "low",
      "evidence": string
    }
  ],
  "food_playbook_updates": [
    {
      "food_name": string,
      "proposed_strategy": {
        "dose_pct": number,
        "extended_grams": number | null,
        "extended_hours": number | null
      },
      "confidence": "high" | "medium" | "low",
      "evidence": string
    }
  ],
  "pump_setting_flags": string[],
  "patterns_noticed": string[]
}

## Rules
- observations: specific, data-grounded. Reference actual BG numbers, times, foods.
- hypotheses: explain possible causes. Offer multiple where there is genuine ambiguity.
- suggested_param_changes: only propose a change if there is a clear pattern across multiple days. Do not suggest the same change that was previously rejected unless new evidence justifies it.
- food_playbook_updates: propose when ≥3 meals of a food show a consistent pattern that differs from current strategy.
- pump_setting_flags: flag for endo discussion only when there is a multi-week pattern that strategy changes alone cannot explain.
- patterns_noticed: anything that doesn't fit the above categories but is worth tracking.
- Be honest about uncertainty. If today was a good day, say so clearly.`
}

export function buildLearningUserContext(input: LearningPromptInput): string {
  const { date, meals, lows, params, recentOutcomeTrend, foodAggregates, rejectedSuggestions } = input
  const lines: string[] = []

  lines.push(`## Review date: ${date}`)
  lines.push(`Meals logged today: ${meals.length}`)
  if (meals.length === 0) lines.push('No meals logged — data quality is low for today.')

  lines.push('\n## Current engine parameters')
  lines.push(`  pre_bolus_pct: ${params.pre_bolus_pct} (${(params.pre_bolus_pct * 100).toFixed(0)}% upfront)`)
  lines.push(`  activity_reduction_pct: ${params.activity_reduction_pct}`)
  lines.push(`  fpu_extension_hours: ${params.fpu_extension_hours}h`)
  lines.push(`  insulin_type: ${params.insulin_type}`)
  lines.push(`  ICR: ${params.current_icr}, ISF: ${params.current_isf}, DIA: ${params.current_dia}h`)

  if (meals.length > 0) {
    lines.push('\n## Today\'s meals')
    for (const meal of meals) {
      lines.push(`\n  [${meal.context}] — ${meal.items}`)
      lines.push(`    Macros: ${meal.total_carbs}g carbs, ${meal.total_fat}g fat, ${meal.total_protein}g protein (${meal.fpu_count.toFixed(2)} FPUs)`)
      lines.push(`    Dose given: ${meal.dose_given ?? 'not logged'}g${meal.extended_given ? ` + ${meal.extended_given}g extended` : ''}`)
      lines.push(`    Outcome: ${meal.outcome_rating ?? 'not yet computed'} | Overall score: ${meal.score_overall ?? '?'} | Peak: ${meal.peak_bg ?? '?'} mg/dL at ${meal.peak_at_minutes ?? '?'} min`)
      if (meal.bg_trace.length > 0) {
        const trace = meal.bg_trace.map(p => `${p.minutes_after}m:${p.bg}`).join(' ')
        lines.push(`    BG trace: ${trace}`)
      }
    }
  }

  if (lows.length > 0) {
    lines.push('\n## Lows today')
    for (const low of lows) {
      lines.push(`  BG ${low.bg} mg/dL — treated with ${low.treatment_carbs}g fast carbs${low.minutes_after_meal != null ? ` (${low.minutes_after_meal} min after last meal)` : ''}`)
      if (low.outcome) lines.push(`  Recovery: ${low.outcome}`)
    }
  } else {
    lines.push('\n## Lows today: none')
  }

  lines.push('\n## 7-day outcome trend')
  for (const day of recentOutcomeTrend) {
    lines.push(`  ${day.date}: ${(day.pct_good * 100).toFixed(0)}% good outcomes (${day.meals_logged} meals)`)
  }

  lines.push('\n## Food outcomes (last 30 days — foods with ≥3 meals)')
  for (const food of foodAggregates) {
    lines.push(`  ${food.name}: ${food.n_meals} meals, ${(food.pct_good * 100).toFixed(0)}% good, avg peak ${food.avg_peak_mgdl ?? '?'} mg/dL at ${food.avg_peak_minutes ?? '?'} min`)
    if (food.current_strategy) lines.push(`    Current strategy: ${food.current_strategy}`)
  }

  if (rejectedSuggestions.length > 0) {
    lines.push('\n## Previously rejected suggestions (do not re-propose without new evidence)')
    for (const r of rejectedSuggestions) {
      lines.push(`  ${r.param} → ${r.suggested} (rejected ${r.rejected_on}${r.reason ? `: ${r.reason}` : ''})`)
    }
  }

  return lines.join('\n')
}
