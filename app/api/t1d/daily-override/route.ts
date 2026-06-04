import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getCentralDateStr } from '@/lib/utils/central-time'

export async function GET(req: NextRequest) {
  const date = new URL(req.url).searchParams.get('date') ?? getCentralDateStr()
  const supabase = createServerClient()
  const { data } = await supabase
    .from('t1d_daily_overrides')
    .select('*')
    .eq('override_date', date)
    .limit(1)
    .maybeSingle()
  return NextResponse.json(data ?? null)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const date = body.override_date ?? getCentralDateStr()

  const { data, error } = await supabase
    .from('t1d_daily_overrides')
    .upsert({ ...body, override_date: date }, { onConflict: 'override_date' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const date = new URL(req.url).searchParams.get('date') ?? getCentralDateStr()
  const supabase = createServerClient()
  await supabase.from('t1d_daily_overrides').delete().eq('override_date', date)
  return NextResponse.json({ ok: true })
}
