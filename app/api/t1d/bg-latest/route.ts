import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const STALE_MS = 15 * 60 * 1000

function linearRate(pts: Array<{ t: number; v: number }>): number {
  const n = pts.length
  if (n < 2) return 0
  const tMean = pts.reduce((s, p) => s + p.t, 0) / n
  const vMean = pts.reduce((s, p) => s + p.v, 0) / n
  const num = pts.reduce((s, p) => s + (p.t - tMean) * (p.v - vMean), 0)
  const den = pts.reduce((s, p) => s + (p.t - tMean) ** 2, 0)
  return den === 0 ? 0 : (num / den) * 60000
}

function rateToTrend(rate: number): string {
  if (rate > 3) return 'doubleUp'
  if (rate > 2) return 'singleUp'
  if (rate > 1) return 'fortyFiveUp'
  if (rate > -1) return 'flat'
  if (rate > -2) return 'fortyFiveDown'
  if (rate > -3) return 'singleDown'
  return 'doubleDown'
}

export async function GET() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('dexcom_egvs')
    .select('id, system_time, display_time, value_mgdl, status, trend, trend_rate, inserted_at')
    .order('system_time', { ascending: false })
    .limit(4)
  if (!data || data.length === 0) return NextResponse.json(null)
  const age = Date.now() - new Date(data[0].system_time).getTime()
  if (age > STALE_MS) return NextResponse.json(null)

  const pts = data
    .filter(e => e.value_mgdl != null)
    .map(e => ({ t: new Date(e.system_time).getTime(), v: Number(e.value_mgdl) }))
  const span = pts.length >= 2 ? pts[0].t - pts[pts.length - 1].t : 0
  if (pts.length >= 2 && span <= 20 * 60 * 1000) {
    data[0] = { ...data[0], trend: rateToTrend(linearRate(pts)) }
  }

  return NextResponse.json(data)
}
