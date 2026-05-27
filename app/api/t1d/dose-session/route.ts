import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') ?? '10')
  const supabase = createServerClient()
  const { data } = await supabase
    .from('t1d_dose_sessions')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit)
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('t1d_dose_sessions')
    .insert({
      timestamp: new Date().toISOString(),
      recommended_dose_grams: body.recommended_dose_grams ?? null,
      engine_reasoning: body.reasoning ?? null,
      entered_by: body.entered_by ?? null,
      context_snapshot: body.items ? { items: body.items, total_carbs: body.total_carbs } : null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
