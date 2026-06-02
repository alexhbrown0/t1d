import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { claude } from '@/lib/claude/client'
import { getLatestEgvs } from '@/lib/dexcom/client'

const SAVE_INTENT = /(save|log|add|write|capture|record|remember|keep).{0,60}(notes?|clinical|protocol|rules?|guidelines?|learnings?|engine)/i

// Detect when the user is reporting a treatment or dose they took/gave
const LOG_INTENT = /\b(gave|give|given|treated|treating|done|did it|entered|dosed|bolused|he (had|ate|took|got)|we (gave|did|entered|treated))\b.{0,60}\b(juice|gummy|gummies|glucose|tabs?|carbs?|pump|correction|low|bolus|grams?|units?)\b/i

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
  const { message, photo_base64, photo_mime_type } = await req.json()
  const supabase = createServerClient()
  const now = new Date()
  const sixHoursAgo = new Date(Date.now() - 6 * 3600000).toISOString()
  const dayOfWeek = now.getDay()

  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const midnightIso = midnight.toISOString()

  const [egvs, bolusResult, bolusToday, lowResult, scheduleResult, paramsResult] = await Promise.all([
    getLatestEgvs(5),
    supabase.from('glooko_bolus').select('timestamp, carbs_input_g, insulin_delivered_u, bg_input_mgdl').gte('timestamp', sixHoursAgo).order('timestamp', { ascending: false }).limit(5),
    supabase.from('glooko_bolus').select('timestamp').gte('timestamp', midnightIso).order('timestamp', { ascending: false }).limit(1),
    supabase.from('t1d_low_treatments').select('timestamp, bg_at_treatment, treatment_type, treatment_carbs_g').gte('timestamp', sixHoursAgo).order('timestamp', { ascending: false }).limit(5),
    supabase.from('t1d_school_schedule').select('event_type, start_time, day_of_week').eq('active', true).eq('day_of_week', dayOfWeek).order('start_time'),
    supabase.from('t1d_engine_params').select('*').order('effective_from', { ascending: false }).limit(1),
  ])

  const params = paramsResult.data?.[0]
  const boluses = bolusResult.data ?? []
  const lows = lowResult.data ?? []
  const schedule = scheduleResult.data ?? []
  const isFirstMealOfDay = (bolusToday.data ?? []).length === 0

  const latest = egvs[0]
  const minsAgo = latest ? Math.floor((Date.now() - new Date(latest.system_time).getTime()) / 60000) : null
  const bgFresh = minsAgo != null && minsAgo <= 15
  const bg = bgFresh && latest?.value_mgdl ? Number(latest.value_mgdl) : null
  const rate = bgFresh ? rateOfChange(egvs) : null
  const bgSequence = bgFresh ? [...egvs].reverse().map(e => Math.round(Number(e.value_mgdl))).join(' → ') : ''
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

  const hour = now.getHours()
  const mealPeriod = hour < 10 ? 'breakfast' : hour < 14 ? 'lunch' : hour < 17 ? 'afternoon' : 'dinner/evening'

  const contextBlock = [
    `Time: ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}, ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek]} — meal period: ${mealPeriod}${isFirstMealOfDay ? ' — FIRST MEAL OF DAY (fasting state, stomach empty, fast Fiasp absorption, full pre-bolus timing applies)' : ' — fed state (not first meal, stomach not empty, absorption slower than fasting)'}`,
    bg != null
      ? `BG (oldest→newest): ${bgSequence} | now ${bg} mg/dL, ${minsAgo}min ago, rate: ${rateStr}`
      : `BG: no live reading (last reading ${minsAgo != null ? `was ${minsAgo} minutes ago — too stale to use` : 'unavailable'})`,
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
${params?.clinical_notes ? `\nClinical notes (follow these — these persist across all sessions and inform every recommendation):\n${params.clinical_notes}\n` : ''}
Current context:
${contextBlock}

Rules:
- Write in plain text only. No markdown, no bold, no headers, no bullet symbols, no asterisks.
- Be concise. Give as much detail as the situation needs — simple status checks warrant one sentence, meal dosing discussions warrant full guidance.
- BG awareness: if the context shows no live reading or a stale one, do NOT invent or assume a BG value. Ask the user to tell you the current number before giving any dosing guidance.
- Dosing guidance: always say "enter X grams into the pump", never units.
- For lows: fast carbs only, no insulin.
- Flag anything uncertain or that needs Alexandra's input.
- Voice dictation: Alexandra and the school nurse often use voice-to-text. Interpret phonetic errors charitably — "bowl" likely means bolus, "fee" or "fee-asp" means Fiasp, "ain't" means ate, "people is" means pre-bolus, "correction" and "correction dose" are interchangeable.
- Fasting vs. fed state: "first meal of day" means his stomach is empty after overnight fasting — Fiasp absorbs fastest, BG rises quickly, and the full pre-bolus lead time matters most. Any meal after the first (even an hour later) is fed state — gastric emptying is slower and pre-bolus timing is less critical. The context block will tell you which state applies.
- Memory: clinical notes ARE the persistence mechanism. When you identify a dosing rule, protocol, or observation worth keeping, propose saving it as a clinical note. Clinical notes persist to every future session and all dosing calculations. You do not need to disclaim that you lack memory — notes bridge that gap.`

  const today = now.toISOString().split('T')[0]

  // Upload photo to storage if present
  let photoUrl: string | null = null
  if (photo_base64) {
    const imgBuffer = Buffer.from(photo_base64, 'base64')
    const ext = (photo_mime_type || 'image/jpeg').split('/')[1] || 'jpg'
    const path = `${today}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('chat-photos')
      .upload(path, imgBuffer, { contentType: photo_mime_type || 'image/jpeg', upsert: false })
    if (!uploadError) {
      const { data: urlData } = supabase.storage.from('chat-photos').getPublicUrl(path)
      photoUrl = urlData.publicUrl
    }
  }

  const storedContent = photo_base64
    ? `[photo] ${message || ''}`.trim()
    : message

  const { data: userMsg } = await supabase.from('t1d_chat_log').insert({
    session_date: today,
    role: 'user',
    content: storedContent,
    photo_url: photoUrl,
  }).select().single()

  const { data: history } = await supabase
    .from('t1d_chat_log')
    .select('role, content, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  const allHistory = (history ?? []).reverse()

  // Drop messages from before a 90-minute gap so Claude doesn't treat old sessions as current context
  let startIdx = 0
  for (let i = allHistory.length - 2; i >= 0; i--) {
    const gap = (new Date(allHistory[i + 1].created_at).getTime() - new Date(allHistory[i].created_at).getTime()) / 60000
    if (gap > 90) { startIdx = i + 1; break }
  }
  const historyMessages = allHistory.slice(startIdx).slice(-10)

  // Build message array — inject vision content for the current message if a photo was attached
  const messages = historyMessages.map((m: { role: string; content: string }, idx: number) => {
    const isLast = idx === historyMessages.length - 1
    if (isLast && m.role === 'user' && photo_base64) {
      return {
        role: 'user' as const,
        content: [
          { type: 'image' as const, source: { type: 'base64' as const, media_type: (photo_mime_type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: photo_base64 } },
          { type: 'text' as const, text: message || 'What food do you see? Give me dosing guidance based on the current BG and context.' },
        ],
      }
    }
    return {
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
    }
  })

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text : ''

  const { data: assistantMsg } = await supabase.from('t1d_chat_log').insert({
    session_date: today,
    role: 'assistant',
    content: reply,
  }).select().single()

  const fullConvo = [
    ...messages.slice(-8),
    { role: 'assistant' as const, content: reply },
  ].map(m => `${m.role === 'user' ? 'Alexandra' : 'Assistant'}: ${typeof m.content === 'string' ? m.content : '[photo]'}`).join('\n')

  let proposal: string | null = null
  if (SAVE_INTENT.test(message) || SAVE_INTENT.test(reply)) {
    const distillResult = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Distill the clinical insight or rule from this conversation into a precise, factual protocol note (2-4 sentences). Write it as a standing instruction — not a conversation summary. Plain text only, no markdown.\n\n${fullConvo}`,
      }],
    })
    proposal = distillResult.content[0].type === 'text' ? distillResult.content[0].text.trim() : null
  }

  // Detect when a treatment or dose was taken and propose logging it
  let log_proposal: Record<string, unknown> | null = null
  if (LOG_INTENT.test(message)) {
    const extractResult = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `From this conversation, extract the medical action that was taken. Return ONLY valid JSON, no other text.

Schema: { "type": "low_treatment" | "dose" | "unknown", "treatment_type": "juice" | "gummies" | "glucose_tabs" | "candy" | "other" | null, "treatment_carbs_g": number | null, "bg_at_treatment": number | null, "dose_grams": number | null, "display": "short human-readable summary e.g. 2 gummies (~8g fast carbs) at 10:34 AM" }

Conversation:
${fullConvo}`,
      }],
    })
    try {
      const raw = extractResult.content[0].type === 'text' ? extractResult.content[0].text.trim() : ''
      const parsed = JSON.parse(raw.replace(/^```json\n?|\n?```$/g, ''))
      if (parsed.type !== 'unknown') {
        log_proposal = { ...parsed, timestamp: now.toISOString() }
      }
    } catch { /* ignore parse errors */ }
  }

  return NextResponse.json({
    userMsg,
    assistantMsg,
    ...(proposal ? { proposal } : {}),
    ...(log_proposal ? { log_proposal } : {}),
  })
}
