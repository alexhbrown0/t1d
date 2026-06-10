import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase/server'
import { getCentralTime, getCentralDateStr, getCentralDayStartUTC, getCentralTimeDisplay } from '@/lib/utils/central-time'

const anthropic = new Anthropic()

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
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago' })
}

export async function generateInsight(): Promise<void> {
  const supabase = createServerClient()
  const sixHoursAgo = new Date(Date.now() - 6 * 3600000).toISOString()
  const midnightIso = getCentralDayStartUTC().toISOString()
  const todayDate = getCentralDateStr()

  const ct = getCentralTime()
  const nowMin = ct.minutesSinceMidnight

  const [egvsResult, scheduleForStableCheck] = await Promise.all([
    supabase.from('dexcom_egvs').select('system_time, value_mgdl, trend').order('system_time', { ascending: false }).limit(5),
    supabase.from('t1d_school_schedule').select('start_time, activity_level').eq('active', true).eq('day_of_week', ct.dayOfWeek),
  ])

  const egvs = egvsResult.data ?? []
  const latest = egvs[0]
  if (!latest?.value_mgdl) return

  const bg = Math.round(Number(latest.value_mgdl))

  // Compute trend from rate of change — stored trend is unreliable (Share API always returns flat)
  const pts = egvs.filter(e => e.value_mgdl != null).map(e => ({ t: new Date(e.system_time).getTime(), v: Number(e.value_mgdl) }))
  const newestPt = pts[0]
  const olderPt = pts[Math.min(3, pts.length - 1)]
  const gapMin = newestPt && olderPt ? (newestPt.t - olderPt.t) / 60000 : 0
  const rate = gapMin > 0 ? (newestPt.v - olderPt.v) / gapMin : 0
  const isDropping = rate < -1
  const isRising = rate > 1

  // High-intensity activity within 75 min triggers a Claude call regardless of BG trend
  const imminentHighActivity = (scheduleForStableCheck.data ?? []).some(s => {
    if (s.activity_level !== 'high') return false
    const [h, m] = s.start_time.split(':').map(Number)
    const minsUntil = (h * 60 + m) - nowMin
    return minsUntil >= -10 && minsUntil <= 75
  })

  const isStable = !isDropping && !isRising && bg >= 70 && bg <= 180 && !imminentHighActivity

  if (isStable) {
    await supabase.from('t1d_insights').upsert({
      id: 1,
      text: 'Stable in range',
      cta: 'chat',
      cta_label: 'Ask assistant',
      is_stable: true,
      bg_value: bg,
      generated_at: new Date().toISOString(),
    })
    return
  }

  // Not stable — fetch full context and call Claude
  const [bolusResult, appDoseResult, lowResult, mealResult, scheduleResult, overrideResult, paramsResult] = await Promise.all([
    supabase.from('glooko_bolus').select('timestamp, carbs_input_g, insulin_delivered_u, bg_input_mgdl').gte('timestamp', sixHoursAgo).order('timestamp', { ascending: false }).limit(5),
    supabase.from('t1d_dose_sessions').select('timestamp, recommended_dose_grams, actual_dose_grams, actual_dose_timestamp, pump_suggested_units, engine_reasoning, context_snapshot').gte('timestamp', sixHoursAgo).order('timestamp', { ascending: false }).limit(5),
    supabase.from('t1d_low_treatments').select('timestamp, bg_at_treatment, treatment_type, treatment_carbs_g').gte('timestamp', sixHoursAgo).order('timestamp', { ascending: false }).limit(3),
    supabase.from('t1d_meal_events').select('timestamp, context, items_offered, items_eaten, total_offered_carbs, total_eaten_carbs').in('context', ['school_lunch', 'snack']).gte('timestamp', midnightIso).order('timestamp', { ascending: false }).limit(3),
    supabase.from('t1d_school_schedule').select('*').eq('active', true).order('start_time'),
    supabase.from('t1d_daily_overrides').select('pe_cancelled, pe_start_time, notes').eq('override_date', todayDate).limit(1),
    supabase.from('t1d_engine_params').select('current_icr, current_dia, pre_bolus_lead_min, activity_reduction_pct, clinical_notes').lte('effective_from', todayDate).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
  ])

  const boluses = bolusResult.data ?? []
  const appDoses = (appDoseResult.data ?? []) as Array<{
    timestamp: string
    recommended_dose_grams: number | null
    actual_dose_grams: number | null
    actual_dose_timestamp: string | null
    pump_suggested_units: number | null
    engine_reasoning: string | null
    context_snapshot: Record<string, unknown> | null
  }>
  const lows = lowResult.data ?? []
  const todayMeals = mealResult.data ?? []
  const todayMeal = todayMeals.find((m: { context: string }) => m.context === 'school_lunch') ?? todayMeals[0] ?? null
  const todaySnack = todayMeals.find((m: { context: string }) => m.context === 'snack') ?? null
  const schedule = scheduleResult.data ?? []
  const todayOverride = overrideResult.data?.[0] ?? null
  const params = paramsResult.data

  const minsAgo = Math.floor((Date.now() - new Date(latest.system_time).getTime()) / 60000)
  const rateVal = rateOfChange(egvs)
  const bgSequence = [...egvs].reverse().map(e => Math.round(Number(e.value_mgdl))).join(' → ')
  const rateStr = rateVal != null ? `${rateVal > 0 ? '+' : ''}${rateVal.toFixed(1)} mg/dL/min` : 'rate unknown'

  const dia = (params?.current_dia ?? 2) * 3600000
  const iobFromGlooko = boluses.reduce((sum, b) => {
    const elapsed = Date.now() - new Date(b.timestamp).getTime()
    return sum + Number(b.insulin_delivered_u ?? 0) * Math.max(0, 1 - elapsed / dia)
  }, 0)
  const confirmedAppDoses = appDoses.filter(d => d.actual_dose_grams != null && d.pump_suggested_units != null)
  const iobFromApp = confirmedAppDoses.reduce((sum, d) => {
    const ts = d.actual_dose_timestamp ?? d.timestamp
    const elapsed = Date.now() - new Date(ts).getTime()
    return sum + Number(d.pump_suggested_units ?? 0) * Math.max(0, 1 - elapsed / dia)
  }, 0)
  const totalIob = Math.max(iobFromGlooko, iobFromApp)

  const upcoming = schedule
    .filter((s: { day_of_week: number }) => s.day_of_week === ct.dayOfWeek)
    .map((s: { event_type: string; start_time: string }) => {
      const [h, m] = s.start_time.split(':').map(Number)
      return { type: s.event_type, minsUntil: (h * 60 + m) - ct.minutesSinceMidnight, time: s.start_time }
    })
    .filter((e: { minsUntil: number }) => e.minsUntil > -30 && e.minsUntil < 180)
    .sort((a: { minsUntil: number }, b: { minsUntil: number }) => a.minsUntil - b.minsUntil)

  const mealLine = [
    todayMeal
      ? todayMeal.items_eaten
        ? `School lunch: ${todayMeal.total_offered_carbs ?? '?'}g packed, ${todayMeal.total_eaten_carbs ?? '?'}g eaten`
        : `School lunch packed: ${todayMeal.total_offered_carbs ?? '?'}g — not eaten yet`
      : 'No school lunch packed today',
    todaySnack
      ? todaySnack.items_eaten
        ? `Afternoon snack: ${todaySnack.total_offered_carbs ?? '?'}g, ${todaySnack.total_eaten_carbs ?? '?'}g eaten`
        : `Afternoon snack packed: ${todaySnack.total_offered_carbs ?? '?'}g — not eaten yet`
      : null,
  ].filter(Boolean).join(' | ')

  const overrideLine = todayOverride?.pe_cancelled
    ? 'PE CANCELLED today'
    : todayOverride?.pe_start_time
    ? `PE moved to ${todayOverride.pe_start_time} today`
    : null

  const lines = [
    `Time: ${getCentralTimeDisplay()}, ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][ct.dayOfWeek]}`,
    `BG (oldest→newest): ${bgSequence} | now ${bg} mg/dL, ${minsAgo}min ago, trend: ${trend}, rate: ${rateStr}`,
    boluses.length > 0
      ? `Pump boluses past 6h: ${boluses.map(b => `${fmtTime(b.timestamp)} — ${b.insulin_delivered_u}U/${b.carbs_input_g ?? 0}g`).join(', ')}`
      : 'No pump boluses in Glooko (24h delay)',
    appDoses.length > 0
      ? `App doses past 6h:\n${appDoses.map(d => {
          const tag = (d.context_snapshot as Record<string, unknown> | null)?.is_followup ? '[follow-up] ' : ''
          const confirmed = d.actual_dose_grams != null
            ? `confirmed ${d.actual_dose_grams}g${d.pump_suggested_units != null ? ` (${d.pump_suggested_units}u)` : ''}`
            : `${d.recommended_dose_grams}g recommended — NOT YET CONFIRMED`
          return `  ${fmtTime(d.timestamp)} ${tag}${confirmed}`
        }).join('\n')}`
      : 'No app doses past 6h',
    `IOB estimate: ~${totalIob.toFixed(2)}U`,
    lows.length > 0
      ? `Low treatments past 6h: ${lows.map(l => `${fmtTime(l.timestamp)} BG ${l.bg_at_treatment} → ${l.treatment_type} ${l.treatment_carbs_g ?? '?'}g`).join(', ')}`
      : 'No lows past 6h',
    mealLine,
    overrideLine ?? '',
    upcoming.length > 0
      ? `Schedule: ${upcoming.map((e: { type: string; time: string; minsUntil: number }) => `${e.type} at ${e.time} (${e.minsUntil > 0 ? `in ${e.minsUntil}min` : `${Math.abs(e.minsUntil)}min ago`})`).join(', ')}`
      : 'No upcoming schedule events',
  ].filter(Boolean)

  const prompt = `You are helping manage T1D for Brooks, a child on Omnipod 5 + Dexcom G7 + Fiasp.
${params?.clinical_notes ? `\nClinical notes (follow these):\n${params.clinical_notes}\n` : ''}
${lines.join('\n')}
Pre-bolus lead: ${params?.pre_bolus_lead_min ?? 8}min. Activity reduction: ${((params?.activity_reduction_pct ?? 0.3) * 100).toFixed(0)}%.

Give ONE sharp, specific insight (1-2 sentences) about what matters most right now. Consider: BG trend, recent doses, IOB, upcoming schedule, lows. Be direct.

Choose CTA:
- "lunch" — BG stable (not dropping) AND lunch is within 90min AND not fully dosed
- "chat" — everything else

Return ONLY valid JSON: {"text": "...", "cta": "lunch" | "chat", "cta_label": "..."}`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (msg.content[0] as { type: string; text: string }).text.trim()
    const parsed = JSON.parse(raw)
    await supabase.from('t1d_insights').upsert({
      id: 1,
      text: parsed.text,
      cta: parsed.cta ?? 'chat',
      cta_label: parsed.cta_label ?? 'Ask assistant',
      is_stable: false,
      bg_value: bg,
      generated_at: new Date().toISOString(),
    })
  } catch {
    // Leave existing insight in place if Claude fails
  }
}
