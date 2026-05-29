import type { T1dEngineParams, IcrSegment, DexcomEgv, MealItem, LearnedStrategy, SimilarFoodOutcome, T1dSchoolSchedule } from '@/types/health'
import { computeFpu } from '@/lib/t1d/fpu'

export function resolveActiveIcr(params: T1dEngineParams, now = new Date()): number {
  if (!params.icr_segments?.length) return params.current_icr ?? 15
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const match = params.icr_segments.find(s => hhmm >= s.start && hhmm < s.end)
  return match?.icr ?? params.current_icr ?? 15
}

function formatIcrForPrompt(params: T1dEngineParams): string {
  if (!params.icr_segments?.length) return `${params.current_icr} g/unit`
  return params.icr_segments.map((s: IcrSegment) => `${s.icr} g/unit (${s.start}–${s.end})`).join(', ')
}

export function buildDoseEngineSystemPrompt(params: T1dEngineParams, clinicalNotes?: string | null): string {
  const activeIcr = resolveActiveIcr(params)
  const fpuCarbEquiv = ((params.fpu_insulin_factor ?? 0.5) * activeIcr).toFixed(1)

  return `You are the dosing engine for Brooks, a child with Type 1 diabetes on Omnipod 5 (pump) and Dexcom G7 (CGM).
${clinicalNotes ? `\n## Clinical notes — follow these:\n${clinicalNotes}\n` : ''}

Your job: analyze a meal and its current context, then output a specific dosing recommendation as JSON. You output carbs to enter into the pump — not insulin units. The pump converts to units using its ICR.

## Brooks's Profile
- Insulin: ${params.insulin_type} (Fiasp onset 0–5 min — dose when he starts eating, not before)
- Target range: 70–180 mg/dL (target: ${params.target_bg} mg/dL)
- ICR: ${formatIcrForPrompt(params)} — reference only, do not output units
- ISF: ${params.current_isf} mg/dL per unit
- DIA: ${params.current_dia} hours

## Reading the BG trend
Use the last 5 CGM readings and the delta between consecutive readings. Do NOT use or mention trend arrows.

The signal is rate-of-drop AND absolute BG together — both matter:
- Dropping ≤10 per reading: not significant at any BG level
- Dropping ~12, BG > 150: not concerning — expected descent from a prior high
- Dropping ~12, BG ≤ 150: mild note, slight caution
- Dropping ~20, BG > 150: mild caution
- Dropping ~20, BG ≤ 150: be cautious — consider delaying dose, set dose_delay_minutes
- Dropping ~30+, BG ≤ 150: definitely delay — set dose_delay_minutes and explain
- Dropping ~30+, BG > 150: still take pause — use judgment given trajectory

When dropping: insulin is still needed — food must be covered. The goal is to delay slightly so the meal carbs catch the drop first, preventing both a low AND a subsequent spike from uncovered food. Set dose_delay_minutes; do not set dose_now_grams to 0 unless BG < 80.

## Dosing timing
- Default: dose when he starts eating (Fiasp acts in 0–5 min)
- Set wait_and_see: true ONLY if BG < 80 AND (steady or dropping), OR BG is clearly dropping fast with BG near range floor
- When wait_and_see: set dose_now_grams to 0 and explain clearly what to watch for

## What drives the dose

1. Carbs — primary signal. Base upfront dose = total_eaten_carbs × ${params.pre_bolus_pct} (${(params.pre_bolus_pct * 100).toFixed(0)}%).

2. Glycemic index — modifies aggressiveness:
   - High GI (≥70): faster, harder spike — weight more carbs upfront
   - Medium GI (56–69): standard split
   - Low GI (≤55): slower absorption — consider more extended coverage even with low fat

3. Fat + protein — high fat causes a secondary spike 60–120+ min after eating.
   FPU = ((fat_g × 9) + (protein_g × 4)) / 100
   - FPUs < 0.5: no extended coverage needed
   - FPUs 0.5–1.5: note it, may not need a formal extended bolus
   - FPUs ≥ 1.5: recommend extended_bolus. Factor: ~${fpuCarbEquiv}g carb-equivalent per FPU over ${params.fpu_extension_hours}h.

4. Recent fast carbs (within 30 min) — still active. Reduce upfront dose proportionally. These show up in the context.

5. Upcoming high-intensity activity (within 30 min) — drives BG down significantly.
   Default reduction: ${(params.activity_reduction_pct * 100).toFixed(0)}%.
   Set hold_for_activity: true and explain when activity is imminent.

## Using food history
Each food item comes with its playbook (if one exists from prior meals) and similar-food outcomes.
- Playbook ≥6 meals: weight heavily — this is real outcome data for Brooks specifically
- Playbook 3–5 meals: useful signal, treat as directional not definitive
- No playbook: use similar-food outcomes and first principles; flag as new_food

## IOB flag
If a bolus was logged recently (within DIA), the pump will subtract for active insulin when carbs are entered. If that subtraction looks like it will significantly undercut what this meal needs, set pump_iob_flag: true and note what to watch for.

## Output — return ONLY valid JSON, no text outside it
{
  "dose_now_grams": number,
  "extended_bolus": { "grams": number, "over_hours": number } | null,
  "hold_for_activity": boolean,
  "wait_and_see": boolean,
  "wait_reason": string | null,
  "dose_delay_minutes": number,
  "confidence": "high" | "medium" | "low",
  "reasoning": string,
  "flags": string[],
  "pump_iob_flag": boolean,
  "pump_iob_note": string | null
}

reasoning: plain English any caregiver can read. Reference actual numbers — the BG reading, the specific food, the timing. Tell them what to do and why. Be specific, be clear.

flags: "high_gi" | "high_fat_extended" | "dropping_bg" | "rising_bg" | "recent_fast_carbs_active" | "hold_for_activity" | "wait_and_see" | "new_food" | "low_confidence" | "pump_may_undercut"`
}

export function buildDoseEngineUserContext(input: {
  meal: MealItem[]
  last5Egvs: Pick<DexcomEgv, 'system_time' | 'value_mgdl'>[]
  scheduleNext2h: T1dSchoolSchedule[]
  recentFastCarbs: { carbs_g: number; logged_at: string } | null
  foodPlaybooks: Record<string, LearnedStrategy>
  similarFoodOutcomes: SimilarFoodOutcome[]
  recentBoluses: { actual_dose_grams: number; actual_dose_timestamp: string }[]
  params: T1dEngineParams
  mealGiCategory?: string | null
  lowTreatmentCarbs?: number | null
  lowTreatmentType?: string | null
  startingBg?: number | null
  startingTrend?: string | null
}): string {
  const { meal, last5Egvs, scheduleNext2h, recentFastCarbs, foodPlaybooks, similarFoodOutcomes, recentBoluses, params, mealGiCategory, lowTreatmentCarbs, lowTreatmentType, startingBg, startingTrend } = input

  const egvsWithDelta = last5Egvs.map((egv, i) => {
    const prev = last5Egvs[i + 1]
    const delta =
      prev && egv.value_mgdl != null && prev.value_mgdl != null
        ? Math.round(egv.value_mgdl - prev.value_mgdl)
        : null
    return { ...egv, delta }
  })

  const currentBg = egvsWithDelta[0]?.value_mgdl ?? 'unknown'
  const totalCarbs = meal.reduce((s, i) => s + i.carbs, 0)
  const totalFat = meal.reduce((s, i) => s + (i.fat ?? 0), 0)
  const totalProtein = meal.reduce((s, i) => s + (i.protein ?? 0), 0)
  const fpuCount = computeFpu(totalFat, totalProtein)

  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  const lines: string[] = []

  lines.push('## Last 5 CGM readings (newest first)')
  if (egvsWithDelta.length === 0) {
    lines.push('  No CGM data available')
  } else {
    for (const egv of egvsWithDelta) {
      const deltaStr = egv.delta != null ? ` (Δ${egv.delta >= 0 ? '+' : ''}${egv.delta} from prior)` : ''
      lines.push(`  ${fmt(egv.system_time)}: ${egv.value_mgdl ?? 'N/A'} mg/dL${deltaStr}`)
    }
  }
  lines.push(`Current BG: ${currentBg} mg/dL`)

  lines.push('\n## Schedule — next 2 hours')
  if (scheduleNext2h.length === 0) {
    lines.push('  No scheduled activities')
  } else {
    for (const s of scheduleNext2h) {
      const note = s.notes ? ` — ${s.notes}` : ''
      lines.push(`  ${s.start_time}–${s.end_time}: ${s.event_type} (${s.activity_level ?? 'normal'})${note}`)
    }
  }

  lines.push('\n## Recent fast carbs (last 30 min)')
  lines.push(
    recentFastCarbs
      ? `  ${recentFastCarbs.carbs_g}g given at ${fmt(recentFastCarbs.logged_at)} — still active`
      : '  None'
  )

  lines.push('\n## Recent boluses (for IOB context)')
  if (recentBoluses.length === 0) {
    lines.push('  No recent boluses logged')
  } else {
    for (const b of recentBoluses) {
      const minsAgo = Math.round((Date.now() - new Date(b.actual_dose_timestamp).getTime()) / 60000)
      lines.push(`  ${b.actual_dose_grams}g dosed ${minsAgo} min ago`)
    }
  }

  if (lowTreatmentCarbs != null || startingBg != null) {
    lines.push('\n## Low treatment at mealtime')
    if (startingBg != null) lines.push(`  BG at meal start: ${startingBg} mg/dL${startingTrend ? `, ${startingTrend}` : ''}`)
    if (lowTreatmentCarbs != null && lowTreatmentCarbs > 0) {
      lines.push(`  Fast carbs given: ${lowTreatmentType ?? 'treatment'} (${lowTreatmentCarbs}g) — factor this into your assessment per clinical notes`)
    } else if (lowTreatmentCarbs === 0) {
      lines.push('  Fast carbs given: none — meal will be the primary BG treatment')
    }
  }

  lines.push('\n## Meal being dosed')
  for (const item of meal) {
    const giStr = (item as MealItem & { gi_category?: string }).gi_category ? ` [${(item as MealItem & { gi_category?: string }).gi_category} GI]` : ''
    lines.push(
      `  ${item.name}${giStr}: ${item.carbs}g carbs, ${item.fat ?? 0}g fat, ${item.protein ?? 0}g protein`
    )
  }
  lines.push(
    `  Totals: ${totalCarbs}g carbs, ${totalFat}g fat, ${totalProtein}g protein — FPUs: ${fpuCount.toFixed(2)}`
  )
  if (mealGiCategory) lines.push(`  Overall meal GI: ${mealGiCategory}`)

  lines.push('\n## Food history (Brooks\'s records)')
  for (const item of meal) {
    const playbook = item.food_repo_id ? foodPlaybooks[item.food_repo_id] : null
    if (playbook) {
      const extStr = playbook.extended_grams
        ? `, +${playbook.extended_grams}g extended over ${playbook.extended_hours}h`
        : ''
      lines.push(`  ${item.name} (${playbook.n_meals} prior meals):`)
      lines.push(`    Strategy: ${(playbook.dose_pct * 100).toFixed(0)}% upfront${extStr}`)
      lines.push(
        `    Outcomes: ${(playbook.pct_good * 100).toFixed(0)}% good, avg peak ${playbook.avg_peak_mgdl ?? '?'} mg/dL at ${playbook.avg_peak_minutes ?? '?'} min`
      )
    } else {
      lines.push(`  ${item.name}: no prior records for this food`)
    }
  }

  if (similarFoodOutcomes.length > 0) {
    lines.push('\n## Similar-profile foods (for reference)')
    for (const f of similarFoodOutcomes) {
      lines.push(
        `  ${f.name} (GI: ${f.gi_estimate ?? '?'}, ${f.carbs_g}g carbs, ${f.fat_g ?? 0}g fat):`
      )
      lines.push(
        `    ${f.n_meals} meals, ${(f.pct_good * 100).toFixed(0)}% good, avg peak ${f.avg_peak_mgdl ?? '?'} mg/dL at ${f.avg_peak_minutes ?? '?'} min`
      )
    }
  }

  return lines.join('\n')
}
