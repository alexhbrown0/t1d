import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export const dynamic = 'force-dynamic'

function rateOfChange(egvs: { system_time: string; value_mgdl: unknown }[]): number | null {
  const pts = egvs
    .filter(e => e.value_mgdl != null)
    .slice(0, 5)
    .map(e => ({ t: new Date(e.system_time).getTime(), bg: Number(e.value_mgdl) }))
    .reverse() // oldest → newest

  if (pts.length < 2) return null
  const spanMin = (pts[pts.length - 1].t - pts[0].t) / 60000
  if (spanMin === 0) return null
  return (pts[pts.length - 1].bg - pts[0].bg) / spanMin
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export async function GET() {
  const supabase = createServerClient()
  const now = new Date()
  const sixHoursAgo = new Date(Date.now() - 6 * 3600000).toISOString()

  const [egvsResult, bolusResult, lowResult, scheduleResult, paramsResult] = await Promise.all([
    supabase.from('dexcom_egvs').select('system_time, value_mgdl, trend').order('system_time', { ascending: false }).limit(5),
    supabase.from('glooko_bolus').select('timestamp, carbs_input_g, insulin_delivered_u, bg_input_mgdl').gte('timestamp', sixHoursAgo).order('timestamp', { ascending: false }).limit(5),
    supabase.from('t1d_low_treatments').select('timestamp, bg_at_treatment, treatment_type, treatment_carbs_g').gte('timestamp', sixHoursAgo).order('timestamp', { ascending: false }).limit(3),
    supabase.from('t1d_school_schedule').select('*').eq('active', true).order('start_time'),
    supabase.from('t1d_engine_params').select('current_dia, pre_bolus_lead_min, activity_reduction_pct, clinical_notes').lte('effective_from', now.toISOString().split('T')[0]).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
  ])

  const egvs = egvsResult.data ?? []
  const boluses = bolusResult.data ?? []
  const lows = lowResult.data ?? []
  const schedule = scheduleResult.data ?? []
  const params = paramsResult.data

  // BG readings: last 5 as a sequence
  const latest = egvs[0]
  const bg = latest?.value_mgdl ? Number(latest.value_mgdl) : null
  const minsAgo = latest ? Math.floor((Date.now() - new Date(latest.system_time).getTime()) / 60000) : null
  const rate = rateOfChange(egvs) // mg/dL per minute

  const bgSequence = [...egvs].reverse().map(e => Math.round(Number(e.value_mgdl))).join(' → ')
  const rateStr = rate != null
    ? `${rate > 0 ? '+' : ''}${rate.toFixed(1)} mg/dL/min`
    : 'rate unknown'

  // IOB: sum contributions from each recent bolus using exponential decay
  const dia = (params?.current_dia ?? 2) * 3600000 // ms
  const totalIob = boluses.reduce((sum, b) => {
    const elapsed = Date.now() - new Date(b.timestamp).getTime()
    const fraction = Math.max(0, 1 - elapsed / dia)
    return sum + Number(b.insulin_delivered_u ?? 0) * fraction
  }, 0)

  // Upcoming schedule
  const dayOfWeek = now.getDay()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const upcoming = schedule
    .filter(s => s.day_of_week === dayOfWeek)
    .map(s => {
      const [h, m] = s.start_time.split(':').map(Number)
      return { type: s.event_type as string, minsUntil: (h * 60 + m) - nowMins, time: s.start_time as string }
    })
    .filter(e => e.minsUntil > -30 && e.minsUntil < 180)
    .sort((a, b) => a.minsUntil - b.minsUntil)

  const lines: string[] = [
    `Time: ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}, ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek]}`,
    bg != null
      ? `BG readings (oldest→newest): ${bgSequence} | current ${bg} mg/dL, ${minsAgo}min ago, rate of change: ${rateStr}`
      : 'BG: no recent data',
    boluses.length > 0
      ? `Recent boluses (last 6h):\n${boluses.map(b => `  ${fmtTime(b.timestamp)} — ${b.insulin_delivered_u}U, ${b.carbs_input_g ?? 0}g carbs${b.bg_input_mgdl ? `, BG ${b.bg_input_mgdl} at dose time` : ''}`).join('\n')}`
      : 'No boluses in past 6h',
    `IOB estimate: ~${totalIob.toFixed(2)}U (computed from recent boluses, DIA=${params?.current_dia ?? 2}h)`,
    lows.length > 0
      ? `Low treatments (last 6h):\n${lows.map(l => `  ${fmtTime(l.timestamp)} — BG ${l.bg_at_treatment}, ${l.treatment_type ?? 'treatment'}, ${l.treatment_carbs_g ?? '?'}g`).join('\n')}`
      : 'No low treatments in past 6h',
    upcoming.length > 0
      ? `Schedule: ${upcoming.map(e => `${e.type} at ${e.time} (${e.minsUntil > 0 ? `in ${e.minsUntil}min` : `${Math.abs(e.minsUntil)}min ago`})`).join(', ')}`
      : 'No upcoming schedule events today',
  ]

  const prompt = `You are helping manage T1D for Brooks, a child on Omnipod 5 + Dexcom G7 + Fiasp.
${params?.clinical_notes ? `\nClinical notes (follow these):\n${params.clinical_notes}\n` : ''}
${lines.join('\n')}
Pre-bolus lead: ${params?.pre_bolus_lead_min ?? 8}min. Activity reduction: ${((params?.activity_reduction_pct ?? 0.3) * 100).toFixed(0)}%.

Give ONE sharp, specific insight (1-2 sentences) about what matters most right now. Base your trend assessment on the actual BG sequence and rate of change — not just the arrow label. Be direct.

Choose the best CTA:
- "lunch" — BG stable (not dropping meaningfully, not recovering from low) AND lunch is within 90min
- "chat" — everything else

Return ONLY valid JSON, no markdown:
{"text": "...", "cta": "lunch" | "chat", "cta_label": "..."}`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (msg.content[0] as { type: string; text: string }).text.trim()
    const parsed = JSON.parse(raw)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({
      text: bg != null ? `BG ${bg} mg/dL, ${rateStr}.` : 'No recent BG data.',
      cta: 'chat',
      cta_label: 'Open assistant',
    })
  }
}
