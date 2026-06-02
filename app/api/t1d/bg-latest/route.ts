import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const STALE_MS = 15 * 60 * 1000 // 15 minutes

export async function GET() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('dexcom_egvs')
    .select('value_mgdl, trend, system_time')
    .order('system_time', { ascending: false })
    .limit(1)
    .single()
  if (!data) return NextResponse.json(null)
  const age = Date.now() - new Date(data.system_time).getTime()
  if (age > STALE_MS) return NextResponse.json(null)
  return NextResponse.json(data)
}
