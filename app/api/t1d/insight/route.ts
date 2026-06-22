import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('t1d_insights')
    .select('text, detail, cta, cta_label, is_stable, generated_at')
    .eq('id', 1)
    .single()
  if (!data) return NextResponse.json(null)
  return NextResponse.json(data)
}
