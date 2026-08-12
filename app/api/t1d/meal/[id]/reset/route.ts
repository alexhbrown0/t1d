import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

// POST /api/t1d/meal/[id]/reset
// Reverts a meal to its just-packed state: removes all dose sessions and any
// pending doses for it, and clears the "what he ate" record. Used to undo an
// accidental "dose given" / eaten marking. The packed items_offered stay intact.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerClient()
  const { id } = await params

  await supabase.from('t1d_pending_doses').delete().eq('meal_event_id', id)
  await supabase.from('t1d_dose_sessions').delete().eq('meal_event_id', id)
  const { error } = await supabase
    .from('t1d_meal_events')
    .update({ items_eaten: null, total_eaten_carbs: null })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
