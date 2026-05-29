import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { type } = await req.json()
  if (type !== 'cgm' && type !== 'pod') {
    return NextResponse.json({ error: 'type must be cgm or pod' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('t1d_device_changes')
    .insert({ type, changed_at: new Date().toISOString() })
    .select('changed_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ changed_at: data.changed_at })
}
