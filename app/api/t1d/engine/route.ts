import { NextRequest, NextResponse } from 'next/server'
import { runDoseEngine } from '@/lib/t1d/engine'
import { createServerClient } from '@/lib/supabase/server'
import type { MealItem, T1dDoseSession } from '@/types/health'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { meal, meal_event_id, entered_by } = body as {
    meal: MealItem[]
    meal_event_id?: string
    entered_by?: string
  }

  if (!meal || !Array.isArray(meal) || meal.length === 0) {
    return NextResponse.json({ error: 'meal is required' }, { status: 400 })
  }

  const output = await runDoseEngine(meal)

  // Persist the dose session
  const supabase = createServerClient()
  const { data: params } = await supabase
    .from('t1d_engine_params')
    .select('id')
    .lte('effective_from', new Date().toISOString().split('T')[0])
    .order('effective_from', { ascending: false })
    .limit(1)
    .single()

  const session: Partial<T1dDoseSession> = {
    meal_event_id: meal_event_id ?? null,
    engine_params_id: params?.id ?? null,
    timestamp: new Date().toISOString(),
    recommended_dose_grams: output.dose_now_grams,
    recommended_extended_grams: output.extended_bolus?.grams ?? null,
    recommended_extended_hours: output.extended_bolus?.over_hours ?? null,
    dose_delay_minutes: output.dose_delay_minutes,
    wait_and_see: output.wait_and_see,
    wait_reason: output.wait_reason,
    engine_reasoning: output.reasoning,
    engine_confidence: output.confidence,
    context_snapshot: { flags: output.flags, pump_iob_flag: output.pump_iob_flag },
    entered_by: entered_by ?? null,
  }

  const { data: sessionRow } = await supabase
    .from('t1d_dose_sessions')
    .insert(session)
    .select('id')
    .single()

  // If engine says to delay, create a pending dose to monitor
  if (output.dose_delay_minutes > 0 || output.wait_and_see) {
    await supabase.from('t1d_pending_doses').insert({
      dose_session_id: sessionRow?.id ?? null,
      meal_event_id: meal_event_id ?? null,
      recommended_grams: output.dose_now_grams,
      recommended_extended_grams: output.extended_bolus?.grams ?? null,
      recommended_extended_hours: output.extended_bolus?.over_hours ?? null,
      reason: output.wait_reason ?? `Delay ${output.dose_delay_minutes} min — BG dropping`,
      status: 'pending',
    })
  }

  return NextResponse.json({
    session_id: sessionRow?.id ?? null,
    ...output,
  })
}
