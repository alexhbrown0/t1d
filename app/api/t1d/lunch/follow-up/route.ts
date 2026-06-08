import { getCentralDateStr } from '@/lib/utils/central-time'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runDoseEngine } from '@/lib/t1d/engine'
import type { MealItem, T1dDoseSession } from '@/types/health'

export async function POST(req: NextRequest) {
  const { meal_event_id, pre_dose_session_id } = await req.json() as {
    meal_event_id: string
    pre_dose_session_id: string
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

  // Sum ALL confirmed doses for this meal so subsequent follow-ups are calculated correctly
  const { data: allConfirmed } = await supabase
    .from('t1d_dose_sessions')
    .select('actual_dose_grams')
    .eq('meal_event_id', meal_event_id)
    .not('actual_dose_grams', 'is', null)
  const totalGiven = allConfirmed?.reduce((s, d) => s + (Number(d.actual_dose_grams) || 0), 0)
    ?? ((preSession as T1dDoseSession).actual_dose_grams ?? (preSession as T1dDoseSession).recommended_dose_grams ?? 0)
  const remainingCarbs = Math.max(0, totalEaten - totalGiven)

  const { data: params } = await supabase
    .from('t1d_engine_params')
    .select('id')
    .lte('effective_from', getCentralDateStr())
    .order('effective_from', { ascending: false })
    .limit(1)
    .single()

  // Nothing meaningful left to cover
  if (remainingCarbs <= 2) {
    const reasoning = `Pre-bolus of ${preBolusGiven}g covered the full meal (${totalEaten}g eaten). No follow-up dose needed.`
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

  // Use engine for the remaining uncovered carbs
  const remainingItems: MealItem[] = eaten.length > 0
    ? eaten.filter(i => i.carbs * (i.qty_offered - (i.qty_eaten ?? 0)) > 1)
    : [{
        food_repo_id: null,
        name: 'Remaining lunch (uncovered)',
        qty_offered: 1,
        qty_eaten: null,
        carbs: remainingCarbs,
        fat: null,
        protein: null,
      }]

  const output = await runDoseEngine(
    remainingItems.length > 0 ? remainingItems : [{
      food_repo_id: null,
      name: 'Remaining lunch (uncovered)',
      qty_offered: 1,
      qty_eaten: null,
      carbs: remainingCarbs,
      fat: null,
      protein: null,
    }]
  )

  const reasoning = `Follow-up: ${totalEaten}g eaten, ${totalGiven}g dosed so far, ${remainingCarbs}g uncovered. ${output.reasoning}`

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
        pre_bolus_given: preBolusGiven,
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
