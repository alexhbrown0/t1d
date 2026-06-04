import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import type { T1dLowTreatment } from '@/types/health'

export async function GET() {
  const supabase = createServerClient()
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('t1d_low_treatments')
    .select('*')
    .gte('timestamp', since)
    .order('timestamp', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createServerClient()
  const { error } = await supabase.from('t1d_low_treatments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json() as Partial<T1dLowTreatment>

  if (!body.treatment_type || !body.source) {
    return NextResponse.json({ error: 'treatment_type and source are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('t1d_low_treatments')
    .insert({
      timestamp: body.timestamp ?? new Date().toISOString(),
      bg_at_treatment: body.bg_at_treatment ?? null,
      treatment_type: body.treatment_type,
      treatment_carbs_g: body.treatment_carbs_g ?? null,
      bg_30min_after: body.bg_30min_after ?? null,
      source: body.source,
      entered_by: body.entered_by ?? null,
      notes: body.notes ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
