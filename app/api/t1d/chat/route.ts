import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { claude } from '@/lib/claude/client'
import { getLatestEgvs } from '@/lib/dexcom/client'

const SAVE_INTENT = /\b(save|log|add|write|capture|record)\b.{0,30}\b(note|clinical|protocol|rule|guideline)\b/i

function rateOfChange(egvs: { system_time: string; value_mgdl: unknown }[]): number | null {
  const pts = egvs
    .filter(e => e.value_mgdl != null)
    .slice(0, 5)
    .map(e => ({ t: new Date(e.system_time).getTime(), bg: Number(e.value_mgdl) }))
    .reverse()
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
  const { data } = await supabase
    .from('t1d_chat_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { message } = await req.json()
  const supabase = createServerClient()
  const now = new Date()
  const sixHoursAgo = new Date(Date.now() - 6 * 3600000).toISOString()
  const dayOfWeek = now.getDay()

  const [egvs, bolusResult, lowResult, scheduleResult, paramsResult] = await Promise.all([
    getLatestEgvs(5),
    supabase.from('glooko_bolus').select('timestamp, carbs_input_g, insulin_delivered_u, bg_input_mgdl').gte('timestamp', sixHoursAgo).order('timestamp', { ascending: false }).limit(5),
    supabase.from('t1d_low_treatments').select('timestamp, bg_at_treatment, treatment_type, treatment_carbs_g').gte('timestamp', sixHoursAgo).order('timestamp', { ascending: false }).limit(5),
    supabase.from('t1d_school_schedule').select('event_type, start_time, day_of_week').eq('active', true).eq('day_of_week', dayOfWeek).order('start_time'),
    supabase.from('t1d_engine_params').select('*').order('effective_from', { ascending: false }).limit(1),
  ])

  const params = paramsResult.data?.[0]
  const boluses = bolusResult.data ?? []
  const lows = lowResult.data ?? []
  const schedule = scheduleResult.data ?? []

  const latest = egvs[0]
  const bg = latest?.value_mgdl ? Number(latest.value_mgdl) : null
  const minsAgo = latest ? Math.floor((Date.now() - new Date(latest.system_time).getTime()) / 60000) : null
  const rate = rateOfChange(egvs)
  const bgSequence = [...egvs].reverse().map(e => Math.round(Number(e.value_mgdl))).join(' → ')
  const rateStr = rate != null ? `${rate > 0 ? '+' : ''}${rate.toFixed(1)} mg/dL/min` : 'unknown'

  const dia = (params?.current_dia ?? 2) * 3600000
  const iob = boluses.reduce((sum, b) => {
    const elapsed = Date.now() - new Date(b.timestamp).getTime()
    return sum + Number(b.insulin_delivered_u ?? 0) * Math.max(0, 1 - elapsed / dia)
  }, 0)

  const nowMins = now.getHours() * 60 + now.getMinutes()
  const upcomingSchedule = schedule
    .map(s => {
      const [h, m] = s.start_time.split(':').map(Number)
      const minsUntil = (h * 60 + m) - nowMins
      return `${s.event_type} at ${s.start_time} (${minsUntil > 0 ? `in ${minsUntil}min` : `${Math.abs(minsUntil)}min ago`})`
    })
    .filter((_, i, arr) => i < 3)
    .join(', ')

  const contextBlock = [
    `Time: ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}, ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek]}`,
    bg != null
      ? `BG (oldest→newest): ${bgSequence} | now ${bg} mg/dL, ${minsAgo}min ago, rate: ${rateStr}`
      : 'BG: no recent data',
    boluses.length > 0
      ? `Boluses past 6h: ${boluses.map(b => `${fmtTime(b.timestamp)} ${b.insulin_delivered_u}U/${b.carbs_input_g ?? 0}g`).join(', ')}`
      : 'No boluses past 6h',
    `IOB: ~${iob.toFixed(2)}U`,
    lows.length > 0
      ? `Lows past 6h: ${lows.map(l => `${fmtTime(l.timestamp)} ${l.bg_at_treatment}mg/dL → ${l.treatment_type ?? 'treated'} ${l.treatment_carbs_g ?? '?'}g`).join(', ')}`
      : 'No lows past 6h',
    upcomingSchedule ? `Schedule today: ${upcomingSchedule}` : 'No upcoming schedule events',
    params ? `ICR: ${params.current_icr}, ISF: ${params.current_isf}, target: ${params.target_bg}, pre-bolus lead: ${params.pre_bolus_lead_min}min` : '',
  ].filter(Boolean).join('\n')

  const systemPrompt = `You are an AI assistant helping manage Brooks's Type 1 diabetes. Brooks is a child on Omnipod 5 with Fiasp insulin and Dexcom G7 CGM.
${params?.clinical_notes ? `\nClinical notes (follow these):\n${params.clinical_notes}\n` : ''}
Current context:
${contextBlock}

Rules:
- Write in plain text only. No markdown, no bold, no headers, no bullet symbols, no asterisks.
- Be concise and direct. One or two sentences is usually enough.
- Dosing guidance: always say "enter X grams into the pump", never units.
- For lows: fast carbs only, no insulin.
- Flag anything uncertain or that needs Alexandra's input.`

  const today = now.toISOString().split('T')[0]

  const { data: userMsg } = await supabase.from('t1d_chat_log').insert({
    session_date: today,
    role: 'user',
    content: message,
  }).select().single()

  const { data: history } = await supabase
    .from('t1d_chat_log')
    .select('role, content')
    .order('created_at', { ascending: false })
    .limit(10)

  const messages = (history ?? []).reverse().map((m: { role: string; content: string }) => ({
    role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: m.content,
  }))

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: systemPrompt,
    messages,
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text : ''

  const { data: assistantMsg } = await supabase.from('t1d_chat_log').insert({
    session_date: today,
    role: 'assistant',
    content: reply,
  }).select().single()

  let proposal: string | null = null
  if (SAVE_INTENT.test(message)) {
    const recentConvo = messages.slice(-8).map(m => `${m.role === 'user' ? 'Alexandra' : 'Assistant'}: ${m.content}`).join('\n')
    const distillResult = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Distill the clinical insight or rule from this conversation into a precise, factual protocol note (2-4 sentences). Write it as a standing instruction — not a conversation summary. Plain text only, no markdown.\n\n${recentConvo}`,
      }],
    })
    proposal = distillResult.content[0].type === 'text' ? distillResult.content[0].text.trim() : null
  }

  return NextResponse.json({ userMsg, assistantMsg, ...(proposal ? { proposal } : {}) })
}
