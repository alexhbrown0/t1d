import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getEgvsInRange } from '@/lib/dexcom/client'
import { scoreOutcome } from '@/lib/t1d/outcome-scorer'
import type { T1dDoseSession } from '@/types/health'

// Finds dose sessions from 4–5h ago that don't have outcomes yet, computes them.
// Run hourly via cron — safe to run multiple times (upserts on session_id).
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // Sessions from 4.5–8h ago that have an actual dose and no outcome yet
  const windowStart = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
  const windowEnd = new Date(Date.now() - 4.5 * 60 * 60 * 1000).toISOString()

  const { data: sessions } = await supabase
    .from('t1d_dose_sessions')
    .select('id, actual_dose_timestamp, recommended_dose_grams')
    .gte('actual_dose_timestamp', windowStart)
    .lte('actual_dose_timestamp', windowEnd)
    .not('actual_dose_grams', 'is', null)

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ ok: true, computed: 0 })
  }

  // Filter to sessions without outcomes
  const sessionIds = sessions.map((s: { id: string }) => s.id)
  const { data: existingOutcomes } = await supabase
    .from('t1d_dose_outcomes')
    .select('session_id')
    .in('session_id', sessionIds)

  const doneIds = new Set((existingOutcomes ?? []).map((o: { session_id: string }) => o.session_id))
  const toCompute = (sessions as T1dDoseSession[]).filter(s => !doneIds.has(s.id))

  let computed = 0
  for (const session of toCompute) {
    if (!session.actual_dose_timestamp) continue
    const doseTime = new Date(session.actual_dose_timestamp)
    const egvEnd = new Date(doseTime.getTime() + 4.5 * 60 * 60 * 1000)
    const egvs = await getEgvsInRange(doseTime, egvEnd)
    const scores = scoreOutcome(egvs, doseTime)

    await supabase.from('t1d_dose_outcomes').upsert({
      session_id: session.id,
      ...scores,
      computed_at: new Date().toISOString(),
    }, { onConflict: 'session_id' })

    computed++
  }

  return NextResponse.json({ ok: true, computed })
}
