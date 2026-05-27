import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

// POST /api/t1d/dose-session/[id]/confirm
// Called when the caregiver confirms the dose was given and optionally enters
// the pump's suggested units (for IOB back-calculation over time).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerClient()
  const { id } = await params
  const body = await req.json() as {
    actual_dose_grams: number
    pump_suggested_units?: number
    entered_by?: string
  }

  if (body.actual_dose_grams == null) {
    return NextResponse.json({ error: 'actual_dose_grams is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('t1d_dose_sessions')
    .update({
      actual_dose_grams: body.actual_dose_grams,
      actual_dose_timestamp: new Date().toISOString(),
      pump_suggested_units: body.pump_suggested_units ?? null,
      entered_by: body.entered_by ?? null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If this session had a pending dose, mark it resolved
  await supabase
    .from('t1d_pending_doses')
    .update({ status: 'dosed', resolved_at: new Date().toISOString(), resolved_reason: 'dosed' })
    .eq('dose_session_id', id)
    .eq('status', 'ready')

  return NextResponse.json(data)
}
