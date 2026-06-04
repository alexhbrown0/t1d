import { getCentralDateStr, getCentralDayStartUTC, getCentralTime } from '@/lib/utils/central-time'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago' })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Chicago' })
}
function timeToMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Cron: runs at 8:35 PM Central (01:35 UTC) after Glooko's nightly sync
// Also manually triggerable with cron secret
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? new URL(req.url).searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const today = getCentralDateStr()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000)
  const yesterdayMidnight = getCentralDayStartUTC(-1)

  // Verify Glooko data is present — always wait for it
  const { data: glookoCheck } = await supabase
    .from('glooko_bolus')
    .select('id')
    .gte('timestamp', yesterdayMidnight.toISOString())
    .limit(1)
    .maybeSingle()

  if (!glookoCheck) {
    return NextResponse.json({ skipped: true, reason: 'Glooko not yet synced — no bolus data from yesterday/today' })
  }

  // ── Gather all data ───────────────────────────────────────────────────────────

  const [
    egvsResult, glookoBolusResult, appDoseResult, mealResult,
    lowsResult, paramsResult, scheduleResult, overridesResult,
    insulinTotalsResult, prevLearningResult,
  ] = await Promise.all([
    supabase.from('dexcom_egvs').select('system_time, value_mgdl').gte('system_time', sevenDaysAgo.toISOString()).order('system_time'),
    supabase.from('glooko_bolus').select('timestamp, carbs_input_g, insulin_delivered_u, carbs_ratio, bg_input_mgdl').gte('timestamp', sevenDaysAgo.toISOString()).order('timestamp'),
    supabase.from('t1d_dose_sessions').select('id, timestamp, actual_dose_timestamp, recommended_dose_grams, actual_dose_grams, pump_suggested_units, starting_bg, meal_event_id, context_snapshot').gte('timestamp', sevenDaysAgo.toISOString()).order('timestamp'),
    supabase.from('t1d_meal_events').select('id, timestamp, context, items_offered, items_eaten, total_offered_carbs, total_eaten_carbs, total_fat_g, total_protein_g, fpu_count').gte('timestamp', sevenDaysAgo.toISOString()).order('timestamp'),
    supabase.from('t1d_low_treatments').select('timestamp, bg_at_treatment, treatment_type, treatment_carbs_g').gte('timestamp', sevenDaysAgo.toISOString()).order('timestamp'),
    supabase.from('t1d_engine_params').select('*').order('effective_from', { ascending: false }).limit(1).single(),
    supabase.from('t1d_school_schedule').select('*').eq('active', true).order('day_of_week').order('start_time'),
    supabase.from('t1d_daily_overrides').select('*').gte('override_date', sevenDaysAgo.toISOString().split('T')[0]),
    supabase.from('glooko_insulin_totals').select('timestamp, total_bolus_u, total_basal_u, total_insulin_u').gte('timestamp', sevenDaysAgo.toISOString()).order('timestamp'),
    supabase.from('t1d_engine_learnings').select('learning_date, claude_observations').lt('learning_date', today).order('learning_date', { ascending: false }).limit(1).maybeSingle(),
  ])

  const egvs = egvsResult.data ?? []
  const glookoBoluses = glookoBolusResult.data ?? []
  const appDoses = appDoseResult.data ?? []
  const meals = mealResult.data ?? []
  const lows = lowsResult.data ?? []
  const params = paramsResult.data
  const schedule = scheduleResult.data ?? []
  const overrides = overridesResult.data ?? []
  const insulinTotals = insulinTotalsResult.data ?? []
  const prevLearning = prevLearningResult.data

  // ── Per-meal analysis with activity context and BG trajectory ────────────────

  type MealAnalysis = {
    date: string
    context: string
    time: string
    items_offered: string
    carbs_offered: number
    items_eaten: string | null
    carbs_eaten: number | null
    pump_carbs_entered: number
    coverage_pct: number | null
    pre_dose_bg: number | null
    bg_30m: number | null
    bg_1h: number | null
    bg_2h: number | null
    bg_3h: number | null
    peak_bg: number | null
    peak_at_min: number | null
    outcome: string
    activity_before: string[]
    activity_after: string[]
    override_note: string | null
  }

  const mealAnalyses: MealAnalysis[] = []

  for (const meal of meals) {
    const mealTs = new Date(meal.timestamp).getTime()
    const mealDateStr = new Date(meal.timestamp).toISOString().split('T')[0]

    // Day of week for schedule lookup
    const mealDow = new Date(meal.timestamp).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Chicago' })
    const mealDowNum = new Date(meal.timestamp).getDay()
    const mealMinOfDay = parseInt(new Date(meal.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Chicago' }).replace(':', ''))

    // Activity context: what's on schedule for this day
    const daySchedule = schedule.filter(s => s.day_of_week === mealDowNum)
    const override = overrides.find(o => o.override_date === mealDateStr)

    // Activity within 2h before and 3h after meal
    const mealCentralMin = parseInt(new Date(meal.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Chicago' })) * 60 +
      parseInt(new Date(meal.timestamp).toLocaleTimeString('en-US', { minute: '2-digit', timeZone: 'America/Chicago' }))

    // Simpler: compute meal time in minutes since midnight (Central)
    const mealTimeStr = new Date(meal.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Chicago' })
    const [mh, mm] = mealTimeStr.split(':').map(Number)
    const mealMins = (isNaN(mh) ? 12 : mh) * 60 + (isNaN(mm) ? 0 : mm)

    const activityBefore = daySchedule.filter(s => {
      if (s.event_type === 'lunch' || s.event_type === 'snack' || s.event_type === 'breakfast' || s.event_type === 'bedtime') return false
      const end = timeToMin(s.end_time)
      return end <= mealMins && end >= mealMins - 120 // ended within 2h before
    })
    const activityAfter = daySchedule.filter(s => {
      if (s.event_type === 'lunch' || s.event_type === 'snack' || s.event_type === 'breakfast' || s.event_type === 'bedtime') return false
      const start = timeToMin(s.start_time)
      return start >= mealMins && start <= mealMins + 180 // starts within 3h after
    })

    // Apply overrides
    const peActive = !override?.pe_cancelled && !override?.camp_cancelled

    // Match Glooko bolus within ±45 min
    const matchedBoluses = glookoBoluses.filter(b => Math.abs(new Date(b.timestamp).getTime() - mealTs) < 45 * 60000)
    const pumpCarbs = matchedBoluses.reduce((s, b) => s + Number(b.carbs_input_g ?? 0), 0)
    const coveragePct = meal.total_eaten_carbs && meal.total_eaten_carbs > 0 && pumpCarbs > 0
      ? Math.round((pumpCarbs / meal.total_eaten_carbs) * 100) : null

    // BG trajectory from dose time (+/- 30 min of meal)
    const doseSession = appDoses.find(d => d.meal_event_id === meal.id)
    const refTime = doseSession
      ? new Date(doseSession.actual_dose_timestamp ?? doseSession.timestamp).getTime()
      : mealTs

    const postEgvs = egvs.filter(e => {
      const t = new Date(e.system_time).getTime()
      return t >= refTime - 5 * 60000 && t <= refTime + 4 * 3600000
    })

    const bgAt = (minOffset: number) => {
      const target = refTime + minOffset * 60000
      return postEgvs.find(e => new Date(e.system_time).getTime() >= target - 7 * 60000)
    }

    const bgs = postEgvs.map(e => Number(e.value_mgdl))
    const peakBg = bgs.length > 0 ? Math.max(...bgs) : null
    const peakIdx = peakBg ? bgs.indexOf(peakBg) : -1
    const peakAtMin = peakIdx >= 0 ? Math.round((new Date(postEgvs[peakIdx].system_time).getTime() - refTime) / 60000) : null

    // Pre-dose BG
    const preBg = bgAt(-10)

    // Outcome rating
    const outcome = !peakBg ? 'unknown'
      : bgs.some(v => v < 70) ? 'low'
      : peakBg > 250 ? 'very_high'
      : peakBg > 180 ? 'high'
      : 'good'

    // Format items
    type Item = { name: string; carbs: number; qty_offered: number; qty_eaten?: number | null }
    const offeredItems = (meal.items_offered as Item[] ?? [])
    const eatenItems = (meal.items_eaten as Item[] ?? [])

    const itemsOfferedStr = offeredItems.map(i => `${i.name} (${Math.round(i.carbs * i.qty_offered)}g)`).join(', ')
    const itemsEatenStr = eatenItems.length > 0
      ? eatenItems.map(i => {
          const pct = i.qty_offered > 0 ? Math.round(((i.qty_eaten ?? 0) / i.qty_offered) * 100) : 0
          return `${i.name} ${pct}%`
        }).join(', ')
      : null

    const actBefore = activityBefore.map(s => `${s.event_type} (ended ${timeToMin(s.end_time)}min)`)
    const actAfter = activityAfter.map(s => `${s.event_type} at ${s.start_time}${peActive ? '' : ' [CANCELLED]'}`)

    mealAnalyses.push({
      date: fmtDate(meal.timestamp),
      context: meal.context,
      time: fmtTime(meal.timestamp),
      items_offered: itemsOfferedStr || 'unknown',
      carbs_offered: meal.total_offered_carbs ?? 0,
      items_eaten: itemsEatenStr,
      carbs_eaten: meal.total_eaten_carbs,
      pump_carbs_entered: pumpCarbs,
      coverage_pct: coveragePct,
      pre_dose_bg: preBg ? Number(preBg.value_mgdl) : null,
      bg_30m: bgAt(30) ? Number(bgAt(30)!.value_mgdl) : null,
      bg_1h: bgAt(60) ? Number(bgAt(60)!.value_mgdl) : null,
      bg_2h: bgAt(120) ? Number(bgAt(120)!.value_mgdl) : null,
      bg_3h: bgAt(180) ? Number(bgAt(180)!.value_mgdl) : null,
      peak_bg: peakBg,
      peak_at_min: peakAtMin,
      outcome,
      activity_before: actBefore,
      activity_after: actAfter,
      override_note: override ? (override.camp_cancelled ? 'NO CAMP' : override.notes) : null,
    })
  }

  // ── Overall TIR ───────────────────────────────────────────────────────────────

  const allBgs = egvs.map(e => Number(e.value_mgdl)).filter(v => !isNaN(v))
  const tir = allBgs.length > 0 ? {
    pct_in_range: Math.round(allBgs.filter(v => v >= 70 && v <= 180).length / allBgs.length * 100),
    pct_low: Math.round(allBgs.filter(v => v < 70).length / allBgs.length * 100),
    pct_high: Math.round(allBgs.filter(v => v > 180).length / allBgs.length * 100),
    avg_bg: Math.round(allBgs.reduce((a, b) => a + b, 0) / allBgs.length),
  } : null

  // TIR by period
  const periodBgs = { morning: [] as number[], afternoon: [] as number[], evening: [] as number[], overnight: [] as number[] }
  for (const e of egvs) {
    const h = parseInt(new Date(e.system_time).toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/Chicago' })) % 24
    const v = Number(e.value_mgdl)
    if (h >= 6 && h < 12) periodBgs.morning.push(v)
    else if (h >= 12 && h < 18) periodBgs.afternoon.push(v)
    else if (h >= 18 && h < 24) periodBgs.evening.push(v)
    else periodBgs.overnight.push(v)
  }

  const periodStats = Object.entries(periodBgs).map(([p, vals]) => ({
    period: p, count: vals.length,
    avg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
    pct_ir: vals.length ? Math.round(vals.filter(v => v >= 70 && v <= 180).length / vals.length * 100) : null,
  }))

  // Low treatment timing clusters
  const lowsByHour: Record<number, number> = {}
  for (const l of lows) {
    const h = parseInt(new Date(l.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/Chicago' })) % 24
    lowsByHour[h] = (lowsByHour[h] ?? 0) + 1
  }

  // ── Build prompt ──────────────────────────────────────────────────────────────

  const mealBlock = mealAnalyses.map(m => {
    const cov = m.coverage_pct != null ? `${m.coverage_pct}% coverage (${m.pump_carbs_entered}g entered into pump)` : 'no pump match found'
    const bg = [
      m.pre_dose_bg ? `pre-dose ${m.pre_dose_bg}` : null,
      m.bg_30m ? `30m: ${m.bg_30m}` : null,
      m.bg_1h ? `1h: ${m.bg_1h}` : null,
      m.bg_2h ? `2h: ${m.bg_2h}` : null,
      m.bg_3h ? `3h: ${m.bg_3h}` : null,
      m.peak_bg ? `peak ${m.peak_bg} at ${m.peak_at_min}min` : null,
    ].filter(Boolean).join(' · ')
    const act = [
      m.activity_before.length ? `activity before: ${m.activity_before.join(', ')}` : null,
      m.activity_after.length ? `activity after: ${m.activity_after.join(', ')}` : null,
    ].filter(Boolean).join(' | ')

    return `${m.date} ${m.time} — ${m.context}
  Offered: ${m.items_offered} (${m.carbs_offered}g)
  Eaten: ${m.items_eaten ?? 'not recorded'} (${m.carbs_eaten ?? '?'}g)
  Dosing: ${cov}
  BG: ${bg || 'no CGM data'}
  Activity: ${act || 'none on schedule'}
  ${m.override_note ? `Override: ${m.override_note}` : ''}
  Outcome: ${m.outcome}`
  }).join('\n\n')

  const prompt = `You are the T1D dosing analyst for Brooks, a child on Omnipod 5 (Fiasp) + Dexcom G7. This is your nightly analysis — the primary input for all dosing decisions and tweaks.

Date: ${today}
${prevLearning ? `Last analysis (${prevLearning.learning_date}): ${prevLearning.claude_observations?.slice(0, 300)}...` : ''}

## CURRENT ENGINE PARAMETERS
${params ? `Pre-bolus: ${(params.pre_bolus_pct * 100).toFixed(0)}% of carbs
Follow-up coverage: ${(params.follow_up_coverage_pct * 100).toFixed(0)}%
Activity reduction: ${(params.activity_reduction_pct * 100).toFixed(0)}% if activity within ${params.activity_window_min}min
ICR: ${params.current_icr} g/unit · ISF: ${params.current_isf} · DIA: ${params.current_dia}h
Target: ${params.target_bg} mg/dL · Insulin: ${params.insulin_type}
${params.clinical_notes ? `Clinical notes:\n${params.clinical_notes}` : ''}` : 'Parameters not set'}

## TIME IN RANGE — 7 DAYS (${allBgs.length} readings)
${tir ? `Overall: ${tir.pct_in_range}% in range · ${tir.pct_low}% low · ${tir.pct_high}% high · avg ${tir.avg_bg} mg/dL` : 'No CGM data'}
${periodStats.map(p => `  ${p.period}: avg ${p.avg ?? '?'} mg/dL, ${p.pct_ir ?? '?'}% in range (${p.count} readings)`).join('\n')}

## MEAL-BY-MEAL ANALYSIS (last 7 days)
For each meal: what was offered, what he ate, what % of eaten carbs were entered into the pump, and the full BG trajectory with activity context.

${mealBlock || 'No meal events recorded this week.'}

## LOW TREATMENTS (${lows.length} total)
${lows.map(l => `  ${fmtDate(l.timestamp)} ${fmtTime(l.timestamp)}: BG ${l.bg_at_treatment} → ${l.treatment_type} ${l.treatment_carbs_g ?? '?'}g`).join('\n') || 'None'}
${Object.keys(lowsByHour).length > 0 ? `Most lows cluster at: ${Object.entries(lowsByHour).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h, n]) => `${h}:00 (${n}x)`).join(', ')}` : ''}

## GLOOKO PUMP DATA (raw, 7 days)
${glookoBoluses.map(b => `  ${fmtDate(b.timestamp)} ${fmtTime(b.timestamp)}: ${b.insulin_delivered_u}U for ${b.carbs_input_g ?? 0}g${b.bg_input_mgdl ? ` (BG ${b.bg_input_mgdl})` : ''}`).join('\n') || 'None'}

## DAILY INSULIN TOTALS
${insulinTotals.map(t => `  ${fmtDate(t.timestamp)}: ${t.total_bolus_u}U bolus + ${t.total_basal_u}U basal = ${t.total_insulin_u}U`).join('\n') || 'None'}

## SCHEDULE CONTEXT
${schedule.filter(s => ['pe', 'playground', 'swimming', 'recess'].includes(s.event_type)).map(s => `  Day ${s.day_of_week}: ${s.event_type} ${s.start_time}-${s.end_time} (${s.activity_level}) — ${s.notes ?? ''}`).join('\n')}
${overrides.length > 0 ? `Overrides this week:\n${overrides.map(o => `  ${o.override_date}: ${o.camp_cancelled ? 'NO CAMP' : ''}${o.pe_cancelled ? ' activity cancelled' : ''}${o.notes ? ' ' + o.notes : ''}`).join('\n')}` : ''}

---

Analyze everything holistically. Focus on patterns across the week:
1. Is dosing coverage consistent or are some meals systematically under/over-dosed?
2. Does activity before/after meals affect outcomes in predictable ways?
3. Are certain meal types (high fat/protein, lunch vs snack) producing different BG patterns?
4. What's the relationship between what he ate vs what was entered into the pump?
5. Are lows clustered around specific times or activities?
6. What do the raw Glooko boluses tell us about timing (vs when the app recommended)?
7. What specific changes — to engine parameters, dosing strategy, or meal planning — would improve outcomes?

Reference specific meals and specific numbers. Be honest if data is incomplete.

Return ONLY valid JSON:
{
  "headline": "2-sentence executive summary of the week",
  "tir_comment": "plain statement about time in range trend",
  "observations": [
    {"topic": "Dosing coverage", "finding": "...", "evidence": "cite specific meals and percentages"},
    {"topic": "Activity impact", "finding": "...", "evidence": "cite specific days/meals where activity preceded or followed"},
    {"topic": "Meal content patterns", "finding": "...", "evidence": "..."},
    {"topic": "Low timing", "finding": "...", "evidence": "..."},
    {"topic": "BG trajectory patterns", "finding": "...", "evidence": "peak timing, 1h/2h trends"},
    {"topic": "Insulin timing", "finding": "...", "evidence": "gap between app recommendation and pump"}
  ],
  "suggestions": [
    {"param": "pre_bolus_pct", "current": 0.40, "suggested": 0.45, "confidence": "high", "rationale": "cite the specific data that drove this"}
  ],
  "pump_setting_flag": null,
  "data_quality": "what data was available and what gaps exist",
  "plain_summary": "3-4 paragraph plain text for email — readable, specific, actionable"
}`

  let result: {
    headline: string
    tir_comment: string
    observations: Array<{ topic: string; finding: string; evidence: string }>
    suggestions: Array<{ param: string; current: number; suggested: number; confidence: string; rationale: string }>
    pump_setting_flag: string | null
    data_quality: string
    plain_summary: string
  }

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (msg.content[0] as { type: string; text: string }).text.trim()
    result = JSON.parse(raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''))
  } catch {
    result = {
      headline: 'Analysis unavailable.',
      tir_comment: tir ? `${tir.pct_in_range}% in range this week.` : 'No CGM data.',
      observations: [],
      suggestions: [],
      pump_setting_flag: null,
      data_quality: `${allBgs.length} CGM readings, ${glookoBoluses.length} pump boluses, ${meals.length} meal events, ${lows.length} low treatments.`,
      plain_summary: 'Could not generate analysis.',
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

  const obsText = result.observations.map(o => `${o.topic}: ${o.finding} — ${o.evidence}`).join('\n\n')

  const { data: learning } = await supabase
    .from('t1d_engine_learnings')
    .upsert({
      learning_date: today,
      claude_observations: `${result.headline}\n\n${result.tir_comment}\n\n${obsText}`,
      claude_suggestions: result.suggestions,
    }, { onConflict: 'learning_date' })
    .select('id')
    .single()

  // ── Email via Resend ──────────────────────────────────────────────────────────

  if (process.env.RESEND_API_KEY) {
    const emailHtml = `<html><body style="font-family:sans-serif;background:#0a0a0a;color:#e5e5e5;padding:24px;max-width:600px;margin:0 auto">
<h2 style="color:#2dd4bf;margin-bottom:4px">Brooks · T1D Nightly Insights</h2>
<p style="color:#6b7280;margin-top:0;font-size:13px">${fmtDate(today)} · 7-day analysis</p>

<div style="background:#141414;border-radius:12px;padding:16px;margin:16px 0;border-left:3px solid #2dd4bf">
<p style="margin:0;font-size:15px;line-height:1.6">${result.headline}</p>
</div>

${tir ? `<div style="background:#141414;border-radius:12px;padding:16px;margin:16px 0">
<p style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px">TIME IN RANGE</p>
<p style="font-size:28px;font-weight:bold;margin:0;color:${tir.pct_in_range >= 70 ? '#2dd4bf' : '#f87171'}">${tir.pct_in_range}%</p>
<p style="font-size:12px;color:#6b7280;margin:4px 0 0">in range (70-180) · ${tir.pct_low}% low · ${tir.pct_high}% high · avg ${tir.avg_bg} mg/dL</p>
<p style="font-size:12px;color:#9ca3af;margin:4px 0 0">${result.tir_comment}</p>
</div>` : ''}

<div style="background:#141414;border-radius:12px;padding:16px;margin:16px 0">
<p style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 14px">OBSERVATIONS</p>
${result.observations.map(o => `<div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #262626">
<p style="color:#9ca3af;font-size:11px;font-weight:600;text-transform:uppercase;margin:0 0 3px">${o.topic}</p>
<p style="margin:0;font-size:13px;line-height:1.5">${o.finding}</p>
<p style="margin:3px 0 0;font-size:11px;color:#6b7280;font-style:italic">${o.evidence}</p>
</div>`).join('')}
</div>

${result.suggestions.length > 0 ? `<div style="background:#141414;border-radius:12px;padding:16px;margin:16px 0;border-left:3px solid #2dd4bf44">
<p style="color:#2dd4bf;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px">SUGGESTED TWEAKS</p>
${result.suggestions.map(s => `<div style="margin-bottom:10px">
<p style="margin:0;font-size:13px"><strong>${s.param}</strong>: ${s.current} → <strong style="color:#2dd4bf">${s.suggested}</strong> <span style="color:#6b7280;font-size:11px">(${s.confidence} confidence)</span></p>
<p style="margin:2px 0 0;font-size:12px;color:#9ca3af">${s.rationale}</p>
</div>`).join('')}
<p style="color:#6b7280;font-size:11px;margin:12px 0 0">Open Engine → Insights in the app to approve or reject.</p>
</div>` : ''}

<div style="color:#6b7280;font-size:12px;margin:24px 0 0;padding-top:16px;border-top:1px solid #262626">
<p style="margin:0">${result.data_quality}</p>
</div>
</body></html>`

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Brooks T1D <onboarding@resend.dev>',
        to: 'alexhbrown0@gmail.com',
        subject: `Brooks T1D · ${today} · ${tir ? `${tir.pct_in_range}% TIR` : 'Nightly Insights'}`,
        html: emailHtml,
      }),
    }).catch(() => null)
  }

  return NextResponse.json({
    learning_id: learning?.id,
    today,
    meals_analyzed: mealAnalyses.length,
    tir: tir ? `${tir.pct_in_range}% in range` : 'no CGM data',
    observations: result.observations.length,
    suggestions: result.suggestions.length,
    email_sent: !!process.env.RESEND_API_KEY,
  })
}
