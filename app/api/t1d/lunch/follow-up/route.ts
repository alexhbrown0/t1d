import { getCentralDateStr } from '@/lib/utils/central-time'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runDoseEngine } from '@/lib/t1d/engine'
import type { MealItem, T1dDoseSession } from '@/types/health'

export async function POST(req: NextRequest) {
  const { meal_event_id, pre_dose_session_id, starting_bg, starting_trend } = await req.json() as {
    meal_event_id: string
    pre_dose_session_id: string
    starting_bg?: number | null
    starting_trend?: string | null
  }

  const supabase = createServerClient()

  const [{ data: meal }, { data: preSession }] = await Promise.all([
    supabase.from('t1d_meal_events').select('*').eq('id', meal_event_id).single(),
    supabase.from('t1d_dose_sessions').select('*').eq('id', pre_dose_session_id).single(),
  ])

  if (!meal?.items_eaten || !preSession) {
    return NextResponse.json({ error: 'Missing eaten data or pre-bolus session' }, { status: 400 })
  }

  const eaten = meal.items_eaten as MealItem[]
  const totalEaten = Math.round(eaten.reduce((s, i) => s + i.carbs * (i.qty_eaten ?? 0), 0))

  // Lunch is deliberately UNDER-covered: ~40% up front + ~25% follow-up = ~65%
  // total, leaving ~35% intentionally uncovered. The follow-up brings total
  // coverage up to COVERAGE_TARGET_PCT of what he ate — it does NOT top up to 100%.
  const COVERAGE_TARGET_PCT = 0.65

  // Sum ALL confirmed doses for this meal so subsequent follow-ups are calculated correctly
  const { data: allConfirmed } = await supabase
    .from('t1d_dose_sessions')
    .select('actual_dose_grams')
    .eq('meal_event_id', meal_event_id)
    .not('actual_dose_grams', 'is', null)
  const totalGiven = allConfirmed?.reduce((s, d) => s + (Number(d.actual_dose_grams) || 0), 0)
    ?? ((preSession as T1dDoseSession).actual_dose_grams ?? (preSession as T1dDoseSession).recommended_dose_grams ?? 0)
  const coverageTarget = Math.round(COVERAGE_TARGET_PCT * totalEaten)
  const remainingCarbs = Math.max(0, coverageTarget - totalGiven)

  const { data: params } = await supabase
    .from('t1d_engine_params')
    .select('id')
    .lte('effective_from', getCentralDateStr())
    .order('effective_from', { ascending: false })
    .limit(1)
    .single()

  // Already at (or past) the ~65% coverage target — no follow-up needed
  if (remainingCarbs <= 2) {
    const reasoning = `Already dosed ${totalGiven}g for ${totalEaten}g eaten — at the ~65% target (we intentionally leave ~35% uncovered). No follow-up dose needed.`
    const { data: session } = await supabase
      .from('t1d_dose_sessions')
      .insert({
        meal_event_id,
        engine_params_id: params?.id ?? null,
        timestamp: new Date().toISOString(),
        recommended_dose_grams: 0,
        engine_reasoning: reasoning,
        engine_confidence: 'high',
        context_snapshot: { is_followup: true, pre_bolus_session_id: pre_dose_session_id },
        entered_by: 'followup',
      })
      .select()
      .single()

    return NextResponse.json({ session_id: session?.id, dose_now_grams: 0, remaining_carbs: 0, reasoning })
  }

  // Dose exactly the follow-up portion that brings total coverage to ~65%.
  const engineItems: MealItem[] = [{
    food_repo_id: null,
    name: 'Lunch follow-up (to ~65% coverage)',
    qty_offered: 1,
    qty_eaten: null,
    carbs: remainingCarbs,
    fat: null,
    protein: null,
  }]
  let output: Awaited<ReturnType<typeof runDoseEngine>>
  try {
    output = await runDoseEngine(engineItems, {
      startingBg: starting_bg ?? null,
      startingTrend: starting_trend ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Engine failed: ${message}` }, { status: 500 })
  }

  const reasoning = `Follow-up: ${totalEaten}g eaten, ${totalGiven}g dosed so far. Covering ${remainingCarbs}g to reach the ~65% target (~35% left uncovered on purpose). ${output.reasoning}`

  const { data: session } = await supabase
    .from('t1d_dose_sessions')
    .insert({
      meal_event_id,
      engine_params_id: params?.id ?? null,
      timestamp: new Date().toISOString(),
      recommended_dose_grams: output.dose_now_grams,
      engine_reasoning: reasoning,
      engine_confidence: output.confidence,
      context_snapshot: {
        is_followup: true,
        pre_bolus_session_id: pre_dose_session_id,
        total_eaten_carbs: totalEaten,
        pre_bolus_given: totalGiven,
        remaining_carbs: remainingCarbs,
      },
      entered_by: 'followup',
    })
    .select()
    .single()

  return NextResponse.json({
    session_id: session?.id,
    dose_now_grams: output.dose_now_grams,
    remaining_carbs: remainingCarbs,
    reasoning,
    confidence: output.confidence,
  })
}
