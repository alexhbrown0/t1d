import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServerClient()
  const now = new Date()

  const [egvsResult, bolusResult, scheduleResult, paramsResult] = await Promise.all([
    supabase.from('dexcom_egvs').select('*').order('system_time', { ascending: false }).limit(6),
    supabase.from('glooko_bolus').select('timestamp, carbs_input_g, insulin_delivered_u').order('timestamp', { ascending: false }).limit(1),
    supabase.from('t1d_school_schedule').select('*').eq('active', true).order('start_time'),
    supabase.from('t1d_engine_params').select('current_dia, pre_bolus_lead_min, activity_reduction_pct, clinical_notes').lte('effective_from', now.toISOString().split('T')[0]).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
  ])

  const egvs = egvsResult.data ?? []
  const lastBolus = bolusResult.data?.[0] ?? null
  const schedule = scheduleResult.data ?? []
  const params = paramsResult.data

  const latest = egvs[0]
  const bg = latest?.value_mgdl ? Number(latest.value_mgdl) : null
  const trend = latest?.trend ?? 'none'
  const minsAgo = latest ? Math.floor((Date.now() - new Date(latest.system_time).getTime()) / 60000) : null

  const hoursSinceBolus = lastBolus
    ? (Date.now() - new Date(lastBolus.timestamp).getTime()) / 3600000
    : null
  const dia = params?.current_dia ?? 2
  const iob = hoursSinceBolus != null && lastBolus?.insulin_delivered_u
    ? Math.max(0, Number(lastBolus.insulin_delivered_u) * (1 - hoursSinceBolus / dia))
    : 0

  const recentLowCount = egvs.filter(e =>
    Number(e.value_mgdl) < 70 &&
    new Date(e.system_time).getTime() > Date.now() - 6 * 3600000
  ).length

  const dayOfWeek = now.getDay()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const upcoming = schedule
    .filter(s => s.day_of_week === dayOfWeek)
    .map(s => {
      const [h, m] = s.start_time.split(':').map(Number)
      const minsUntil = (h * 60 + m) - nowMins
      return { type: s.event_type as string, minsUntil, time: s.start_time as string }
    })
    .filter(e => e.minsUntil > -30 && e.minsUntil < 180)
    .sort((a, b) => a.minsUntil - b.minsUntil)

  const contextLines = [
    `Time: ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}, ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek]}`,
    bg != null
      ? `BG: ${bg} mg/dL, ${trend}${minsAgo != null ? `, ${minsAgo}min ago` : ''}`
      : 'BG: no recent data',
    hoursSinceBolus != null
      ? `Last bolus: ${hoursSinceBolus.toFixed(1)}h ago (${lastBolus?.insulin_delivered_u}U, ${lastBolus?.carbs_input_g ?? 0}g), IOB ~${iob.toFixed(2)}U`
      : 'No bolus data yet',
    recentLowCount > 0 ? `⚠ ${recentLowCount} low reading(s) in past 6h` : 'No lows in past 6h',
    upcoming.length > 0
      ? upcoming.map(e => `${e.type} at ${e.time} (${e.minsUntil > 0 ? `in ${e.minsUntil}min` : `${Math.abs(e.minsUntil)}min ago`})`).join(', ')
      : 'No upcoming schedule events',
  ]

  const prompt = `You are helping manage T1D for Brooks, a child on Omnipod 5 + Dexcom G7 + Fiasp.
${params?.clinical_notes ? `\nClinical notes:\n${params.clinical_notes}\n` : ''}

${contextLines.join('\n')}
Pre-bolus lead time: ${params?.pre_bolus_lead_min ?? 8} min. Activity reduction: ${((params?.activity_reduction_pct ?? 0.3) * 100).toFixed(0)}%.

Give ONE sharp, specific insight (1-2 sentences) about what matters most right now. Be direct — no hedging, no "consider". If lunch is within 90 minutes, focus on lunch prep or why it needs discussion first. If BG is trending low or recovering from a low, address that before any dosing.

Choose the best next action:
- "lunch" — BG stable (not dropping fast, not recovering from a low) AND lunch is within 90 min
- "chat" — everything else: BG concern, low recovery, unusual pattern, or just a good time to think out loud

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
      text: bg != null ? `BG ${bg} mg/dL, ${trend}.` : 'No recent BG data.',
      cta: 'chat',
      cta_label: 'Open assistant',
    })
  }
}
