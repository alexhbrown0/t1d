import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()

  // Delete dependent rows first to avoid FK constraint failures
  await supabase.from('t1d_pending_doses').delete().eq('dose_session_id', id)
  await supabase.from('t1d_dose_outcomes').delete().eq('session_id', id)

  const { error } = await supabase.from('t1d_dose_sessions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
