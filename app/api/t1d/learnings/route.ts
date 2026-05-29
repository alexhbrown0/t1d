import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('t1d_engine_learnings')
    .select('id, learning_date, claude_observations, claude_suggestions, data_quality_note, action_taken')
    .order('learning_date', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(
    (data ?? []).map(l => ({
      ...l,
      data_quality: l.data_quality_note,
    }))
  )
}

export async function PATCH(req: NextRequest) {
  const { id, action_taken } = await req.json() as { id: string; action_taken: string }
  if (!id || !action_taken) {
    return NextResponse.json({ error: 'id and action_taken required' }, { status: 400 })
  }
  const supabase = createServerClient()
  const { error } = await supabase
    .from('t1d_engine_learnings')
    .update({ action_taken })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
