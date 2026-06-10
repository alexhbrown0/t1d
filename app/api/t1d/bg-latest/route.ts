import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const STALE_MS = 15 * 60 * 1000

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
  return NextResponse.json(data)
}
