import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { claude } from '@/lib/claude/client'
import { getLatestEgvs } from '@/lib/dexcom/client'

export async function POST(req: NextRequest) {
  const { bg, activity_soon } = await req.json()

  const supabase = createServerClient()
  const [paramsResult, egvs] = await Promise.all([
    supabase.from('t1d_engine_params').select('*').order('effective_from', { ascending: false }).limit(1),
    getLatestEgvs(3).catch(() => []),
  ])

  const params = paramsResult.data?.[0]
  const trend = egvs[0]?.trend ?? 'unknown'

  const prompt = `Brooks has T1D on Omnipod 5 with Fiasp. Current BG: ${bg} mg/dL, trend: ${trend}.
${activity_soon ? 'Activity is expected within the next hour.' : ''}
${params ? `ISF: ${params.current_isf}, Target BG: ${params.target_bg}, ICR: ${params.current_icr}` : ''}

Give a brief correction bolus recommendation in plain English. Say "enter X grams into the pump" — never units. If BG is below 180 or trend is dropping fast, recommend holding off. Keep it to 2-3 sentences.`

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  })

  const recommendation = response.content[0].type === 'text' ? response.content[0].text : ''

  return NextResponse.json({ recommendation })
}
