import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('t1d_engine_params')
    .select('*')
    .lte('effective_from', new Date().toISOString().split('T')[0])
    .order('effective_from', { ascending: false })
    .limit(1)
    .single()
  return NextResponse.json(data ?? null)
}

const NUMERIC_PARAMS = new Set([
  'pre_bolus_pct', 'pre_bolus_lead_min', 'activity_reduction_pct',
  'activity_window_min', 'fpu_insulin_factor', 'fpu_extension_hours',
  'low_carryover_reduction_pct', 'current_icr', 'current_isf', 'current_dia', 'target_bg',
])

export async function PATCH(req: NextRequest) {
  const body = await req.json() as Record<string, unknown>
  const supabase = createServerClient()
  const { data: current } = await supabase
    .from('t1d_engine_params')
    .select('id')
    .order('effective_from', { ascending: false })
    .limit(1)
    .single()
  if (!current) return NextResponse.json({ error: 'No engine params found' }, { status: 404 })

  const update: Record<string, unknown> = {}
  if (typeof body.clinical_notes === 'string') update.clinical_notes = body.clinical_notes
  for (const [k, v] of Object.entries(body)) {
    if (NUMERIC_PARAMS.has(k) && typeof v === 'number') update[k] = v
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('t1d_engine_params')
    .update(update)
    .eq('id', current.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
