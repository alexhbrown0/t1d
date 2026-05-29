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

export async function PATCH(req: NextRequest) {
  const { clinical_notes } = await req.json()
  if (typeof clinical_notes !== 'string') {
    return NextResponse.json({ error: 'clinical_notes must be a string' }, { status: 400 })
  }
  const supabase = createServerClient()
  const { data: current } = await supabase
    .from('t1d_engine_params')
    .select('id')
    .order('effective_from', { ascending: false })
    .limit(1)
    .single()
  if (!current) return NextResponse.json({ error: 'No engine params found' }, { status: 404 })
  const { data, error } = await supabase
    .from('t1d_engine_params')
    .update({ clinical_notes })
    .eq('id', current.id)
    .select('clinical_notes')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
