import type { T1dEngineParams, IcrSegment, DexcomEgv, MealItem, LearnedStrategy, SimilarFoodOutcome, T1dSchoolSchedule } from '@/types/health'
import { computeFpu } from '@/lib/t1d/fpu'
import { getCentralTime } from '@/lib/utils/central-time'

export function resolveActiveIcr(params: T1dEngineParams, now = new Date()): number {
  if (!params.icr_segments?.length) return params.current_icr ?? 15
  const hhmm = getCentralTime(now).timeStr
  const match = params.icr_segments.find(s => hhmm >= s.start && hhmm < s.end)
  return match?.icr ?? params.current_icr ?? 15
}

function formatIcrForPrompt(params: T1dEngineParams): string {
  if (!params.icr_segments?.length) return `${params.current_icr} g/unit`
  return params.icr_segments.map((s: IcrSegment) => `${s.icr} g/unit (${s.start}–${s.end})`).join(', ')
}

export function buildDoseEngineSystemPrompt(params: T1dEngineParams, clinicalNotes?: string | null, mealType: 'lunch' | 'snack' | 'extended_day_snack' = 'lunch'): string {
  const activeIcr = resolveActiveIcr(params)
  const fpuCarbEquiv = ((params.fpu_insulin_factor ?? 0.5) * activeIcr).toFixed(1)
  const isExtendedDay = mealType === 'extended_day_snack'

  const extendedDayProtocol = `## Extended-day snack dosing — CRITICAL (this overrides the sizing rule below)
This is Brooks's **extended-day (after-care) snack**, eaten ~2:45–3:15 PM, and it is usually **high-GI** (cookie, chips).
- Dose it as ONE single dose — there is NO 70/30 follow-up (no caregiver at after-care for a top-up). The >30g split rule does NOT apply here; cover it in one dose even if total carbs slightly exceed 30g.
- A **caregiver-reported "expected activity after"** signal is in the user context and is AUTHORITATIVE (do not expect a schedule block for it):
  - **HARD play expected** (the usual case): he goes straight into intense outdoor play. Reduce the dose to **roughly half — target ~50% of the full carb dose**. (This is a larger cut than the standard ${(params.activity_reduction_pct * 100).toFixed(0)}% activity reduction, because the play is prolonged/hard and the snack is high-GI.) Set hold_for_activity: true.
  - **CALM expected** (movie / rain day): give the FULL carb dose; add a note to watch for a high-GI spike.
- Still apply the low/dropping-BG delay and wait_and_see rules below on top of this.

`

  const doseProtocol = `## Dose sizing — CRITICAL (decided by TOTAL carbs)
Look at the total carbs of what he's eating and pick the strategy. This rule is universal — it applies to snacks, lunches, everything.

**Total carbs 30g or LESS → ONE full dose now.** Cover 100% of the carbs in a single dose. No 70/30 split, no follow-up. "Full dose" means you don't hold back carbs for a follow-up — you still reduce for genuinely UPCOMING activity and for a low/dropping BG per the rules below. A normal BG plus a real carb amount means a real, full dose; do not shrink a small dose toward zero for activity that is already over.

**Total carbs OVER 30g → 70/30 split.** This first dose is dose 1 of 2: it covers roughly pre_bolus_pct of expected carbs, and a single follow-up dose ~1 hour later covers the rest, adjusted for what he actually ate and where BG landed.
- The first dose does NOT cover the full meal (the remaining ~30% is the follow-up).
- Be conservative — the follow-up fills the gap. An overdose at school with no immediate caregiver is the worst outcome.
- Never pre-cover the follow-up carbs in this first dose.
- Hard ceiling: the first dose must not exceed 30g. Only exceed if BG is above 200 and actively rising, and never above 40g.

Both paths still account for UPCOMING activity (see below).`

  return `You are the dosing engine for Brooks, a child with Type 1 diabetes on Omnipod 5 (pump) and Dexcom G7 (CGM).
${clinicalNotes ? `\n## Clinical notes — follow these:\n${clinicalNotes}\n` : ''}

Your job: analyze a meal or snack and its current context, then output a specific dosing recommendation as JSON. You output carbs to enter into the pump — not insulin units. The pump converts to units using its ICR.
${isExtendedDay ? `\n${extendedDayProtocol}` : ''}
## Brooks's Profile
- Insulin: ${params.insulin_type} (Fiasp onset 0–5 min — dose when he starts eating, not before)
- Target range: 70–180 mg/dL (target: ${params.target_bg} mg/dL)
- ICR: ${formatIcrForPrompt(params)} — reference only, do not output units
- ISF: ${params.current_isf} mg/dL per unit
- DIA: ${params.current_dia} hours

${doseProtocol}

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

1. Carbs — primary signal.
   - Total carbs 30g or less: base dose = the FULL carb amount, in one dose.
   - Total carbs over 30g: base first dose = total_carbs × ${params.pre_bolus_pct} (${(params.pre_bolus_pct * 100).toFixed(0)}%), with the follow-up covering the rest.
   **Hard ceiling (split path only): the first dose must not exceed 30g.** Only exceed 30g if BG is above 200 mg/dL and actively rising — and never go above 40g under any circumstance.
   This ceiling exists because on the split path the follow-up covers what he actually eats, Fiasp stacks fast, and over-dosing a child at school with no immediate caregiver present is the highest-risk outcome.

2. Glycemic index — affects monitoring urgency and split, NOT the ceiling:
   - High GI (≥70): watch more closely post-meal, may justify leaning toward the top of the pre_bolus_pct range — but do NOT push dose_now_grams above the 30g ceiling
   - Medium GI (56–69): standard split
   - Low GI (≤55): slower absorption — consider more extended coverage even with low fat
   GI never justifies exceeding the ceiling. If the meal is very high GI, note it in reasoning so the caregiver knows to watch closely.

3. Fat + protein — high fat causes a secondary spike 60–120+ min after eating.
   FPU = ((fat_g × 9) + (protein_g × 4)) / 100
   - FPUs < 0.5: no extended coverage needed
   - FPUs 0.5–1.5: note it, may not need a formal extended bolus
   - FPUs ≥ 1.5: recommend extended_bolus. Factor: ~${fpuCarbEquiv}g carb-equivalent per FPU over ${params.fpu_extension_hours}h.

4. Recent fast carbs (within 30 min) — still active. Reduce upfront dose proportionally. These show up in the context.

5. Upcoming high-intensity activity — drives BG down significantly. What matters is what is AHEAD of him, starting from now — think in terms of the next 10, 15, 20 minutes and beyond. Do NOT weight what he's currently in or just finished; weight what's coming. Judge by when the next activity STARTS:
   - Starts within ~30 min: imminent. Reduce by full activity_reduction_pct (${(params.activity_reduction_pct * 100).toFixed(0)}%). Set hold_for_activity: true.
   - Starts in ~30–90 min: significant. Reduce by ~half of activity_reduction_pct. Note it clearly.
   - Starts in ~90–180 min: meaningful — reduce by ~25% of activity_reduction_pct. Note in reasoning.
   - Starts 180+ min out: light note only. Minimal dose impact but mention it.
   - Activity he is CURRENTLY IN, that is ENDING (even a few minutes left), or ALREADY FINISHED: treat him as DONE with it and do NOT reduce the dose for it at all. It is not upcoming activity — assume it's over. Past activity never drives a normal-BG dose toward zero.
   IMPORTANT — school-year schedule: activity happens in the MORNING and just BEFORE lunch (PE ~9:30–10:00, recess 12:00–12:25; Specials 9:00–9:30 is non-physical). For the LUNCH dose specifically, the regular academic afternoon (Social Studies/Science, Math, Writing) has no scheduled activity, so don't invent a post-lunch activity reduction; recess ends right as lunch begins, so weigh current BG and trend rather than a post-meal activity cut. NOTE: this does not mean afternoons are always sedentary — on school days Brooks also has an extended-day snack that is often followed by hard outdoor play. That case is handled by the caregiver-reported activity signal (see the extended-day section / the post-snack activity line in the context), not by this timetable. Only apply activity reduction when the schedule OR the caregiver-reported signal actually shows high-intensity activity ahead of the dose you're calculating.

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
  mealType?: 'lunch' | 'snack' | 'extended_day_snack'
  expectedActivity?: 'high' | 'none' | null
}): string {
  const { meal, last5Egvs, scheduleNext2h, recentFastCarbs, foodPlaybooks, similarFoodOutcomes, recentBoluses, params, mealGiCategory, lowTreatmentCarbs, lowTreatmentType, startingBg, startingTrend, expectedActivity } = input

  const minsOld = (iso: string) => Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  const egvsWithDelta = last5Egvs.map((egv, i) => {
    const prev = last5Egvs[i + 1]
    const delta =
      prev && egv.value_mgdl != null && prev.value_mgdl != null
        ? Math.round(egv.value_mgdl - prev.value_mgdl)
        : null
    return { ...egv, delta }
  })

  const latestEgv = egvsWithDelta[0]
  const latestAge = latestEgv ? minsOld(latestEgv.system_time) : null
  const bgStale = latestAge == null || latestAge > 15
  const currentBg = !bgStale ? (latestEgv?.value_mgdl ?? 'unknown') : 'unavailable — reading is stale'
  const qtyOf = (i: MealItem) => i.qty_offered ?? 1
  const totalCarbs = meal.reduce((s, i) => s + i.carbs * qtyOf(i), 0)
  const totalFat = meal.reduce((s, i) => s + (i.fat ?? 0) * qtyOf(i), 0)
  const totalProtein = meal.reduce((s, i) => s + (i.protein ?? 0) * qtyOf(i), 0)
  const fpuCount = computeFpu(totalFat, totalProtein)

  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago' })

  const lines: string[] = []

  if (egvsWithDelta.length === 0 || bgStale) {
    lines.push('## CGM — NO LIVE READING')
    if (latestAge != null) {
      lines.push(`  Last reading was ${latestAge} minutes ago — too stale to dose on.`)
    } else {
      lines.push('  No CGM data in database.')
    }
    if (startingBg != null) {
      lines.push(`  Caregiver-reported BG: ${startingBg} mg/dL${startingTrend ? ` (${startingTrend})` : ''}. Use this as the current BG.`)
    } else {
      lines.push('  Ask the caregiver for the current BG before making any dosing recommendation.')
    }
  } else {
    lines.push('## Last 5 CGM readings (newest first)')
    for (const egv of egvsWithDelta) {
      const ageStr = `${minsOld(egv.system_time)}min ago`
      const deltaStr = egv.delta != null ? ` (Δ${egv.delta >= 0 ? '+' : ''}${egv.delta})` : ''
      lines.push(`  ${fmt(egv.system_time)} (${ageStr}): ${egv.value_mgdl ?? 'N/A'} mg/dL${deltaStr}`)
    }
    lines.push(`Current BG: ${currentBg} mg/dL (${latestAge}min ago)`)
  }

  const nowMinForSchedule = getCentralTime().minutesSinceMidnight
  lines.push('\n## Schedule — next 4 hours')
  if (scheduleNext2h.length === 0) {
    lines.push('  No scheduled activities')
  } else {
    for (const s of scheduleNext2h) {
      const [sh, sm] = s.start_time.split(':').map(Number)
      const minsUntil = (sh * 60 + sm) - nowMinForSchedule
      const relStr = minsUntil <= 0 ? `in progress (started ${Math.abs(minsUntil)}min ago)` : `in ${minsUntil}min`
      const note = s.notes ? ` — ${s.notes}` : ''
      lines.push(`  ${s.start_time}–${s.end_time} (${relStr}): ${s.event_type} (${s.activity_level ?? 'normal'})${note}`)
    }
  }

  if (expectedActivity != null) {
    lines.push('\n## Post-snack activity (caregiver-reported — authoritative)')
    lines.push(
      expectedActivity === 'high'
        ? '  Brooks goes straight into HARD outdoor play right after this snack — imminent, high intensity, starting now.'
        : '  Calm afternoon (movie / rain) — no meaningful activity after this snack.'
    )
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

  if (lowTreatmentCarbs != null) {
    lines.push('\n## Low treatment at mealtime')
    if (lowTreatmentCarbs != null && lowTreatmentCarbs > 0) {
      lines.push(`  Fast carbs given: ${lowTreatmentType ?? 'treatment'} (${lowTreatmentCarbs}g) — factor this into your assessment per clinical notes`)
    } else if (lowTreatmentCarbs === 0) {
      lines.push('  Fast carbs given: none — meal will be the primary BG treatment')
    }
  }

  lines.push('\n## Meal being dosed')
  for (const item of meal) {
    const giStr = (item as MealItem & { gi_category?: string }).gi_category ? ` [${(item as MealItem & { gi_category?: string }).gi_category} GI]` : ''
    const q = qtyOf(item)
    const qtyStr = q !== 1 ? ` ×${q}` : ''
    lines.push(
      `  ${item.name}${qtyStr}${giStr}: ${item.carbs * q}g carbs, ${(item.fat ?? 0) * q}g fat, ${(item.protein ?? 0) * q}g protein`
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
