import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const STALE_MS = 15 * 60 * 1000

function computeTrend(latest: { system_time: string; value_mgdl: unknown }, prev: { system_time: string; value_mgdl: unknown }): string {
  if (latest.value_mgdl == null || prev.value_mgdl == null) return 'flat'
  const gapMs = new Date(latest.system_time).getTime() - new Date(prev.system_time).getTime()
  if (gapMs <= 0 || gapMs > 10 * 60 * 1000) return 'flat'
  const rate = (Number(latest.value_mgdl) - Number(prev.value_mgdl)) / (gapMs / 60000)
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
    .limit(2)
  if (!data || data.length === 0) return NextResponse.json(null)
  const age = Date.now() - new Date(data[0].system_time).getTime()
  if (age > STALE_MS) return NextResponse.json(null)
  if (data.length >= 2) {
    data[0] = { ...data[0], trend: computeTrend(data[0], data[1]) }
  }
  return NextResponse.json(data)
}
