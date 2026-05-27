import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('dexcom_egvs')
    .select('value_mgdl, trend, system_time')
    .order('system_time', { ascending: false })
    .limit(1)
    .single()
  return NextResponse.json(data ?? null)
}
