import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const STALE_MS = 15 * 60 * 1000

function rateToTrend(rate: number): string {
  if (rate > 3) return 'doubleUp'
  if (rate > 2) return 'singleUp'
  if (rate > 1.5) return 'fortyFiveUp'
  if (rate > -1.5) return 'flat'
  if (rate > -3) return 'fortyFiveDown'
  if (rate > -4) return 'singleDown'
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

  if (data.length >= 2 && data[0].value_mgdl != null && data[1].value_mgdl != null) {
    const gapMs = new Date(data[0].system_time).getTime() - new Date(data[1].system_time).getTime()
    if (gapMs > 0 && gapMs <= 10 * 60 * 1000) {
      const rate = (Number(data[0].value_mgdl) - Number(data[1].value_mgdl)) / (gapMs / 60000)
      data[0] = { ...data[0], trend: rateToTrend(rate) }
    }
  }

  return NextResponse.json(data)
}
