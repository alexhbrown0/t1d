import { getCentralDateStr, getCentralDayStartUTC } from '@/lib/utils/central-time'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago',
  })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Chicago',
  })
}

// Triggered by Glooko ingest or nightly cron
export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const secret = req.headers.get('x-cron-secret') ?? url.searchParams.get('secret')
  const force = url.searchParams.get('force') === 'true'

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const today = getCentralDateStr()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000)
  const todayMidnight = getCentralDayStartUTC()
  const yesterdayMidnight = getCentralDayStartUTC(-1)

  // Wait for Glooko — only proceed if today's or yesterday's data is present
  if (!force) {
    const { data: glookoCheck } = await supabase
      .from('glooko_bolus')
      .select('id')
      .gte('timestamp', yesterdayMidnight.toISOString())
      .limit(1)
      .maybeSingle()

    if (!glookoCheck) {
      return NextResponse.json({ skipped: true, reason: 'No Glooko data yet — will retry after sync' })
    }
  }

  // ── Gather all data ──────────────────────────────────────────────────────────

  const [
    egvsResult,
    glookoBolusResult,
    appDoseResult,
    mealResult,
    lowsResult,
    outcomesResult,
    paramsResult,
    scheduleResult,
    overridesResult,
    insulinTotalsResult,
    prevLearningResult,
  ] = await Promise.all([
    // 7 days of CGM
    supabase.from('dexcom_egvs')
      .select('system_time, value_mgdl')
      .gte('system_time', sevenDaysAgo.toISOString())
      .order('system_time'),
    // 7 days of Glooko pump boluses (precise timing)
    supabase.from('glooko_bolus')
      .select('timestamp, carbs_input_g, insulin_delivered_u, carbs_ratio, bg_input_mgdl')
      .gte('timestamp', sevenDaysAgo.toISOString())
      .order('timestamp'),
    // 7 days of app-logged dose sessions
    supabase.from('t1d_dose_sessions')
      .select('id, timestamp, actual_dose_timestamp, recommended_dose_grams, actual_dose_grams, pump_suggested_units, engine_reasoning, engine_confidence, low_treatment_carbs, starting_bg, meal_event_id, context_snapshot')
      .gte('timestamp', sevenDaysAgo.toISOString())
      .order('timestamp'),
    // 7 days of meal events
    supabase.from('t1d_meal_events')
      .select('id, timestamp, context, items_offered, items_eaten, total_offered_carbs, total_eaten_carbs, total_fat_g, total_protein_g, fpu_count')
      .gte('timestamp', sevenDaysAgo.toISOString())
      .order('timestamp'),
    // 7 days of low treatments
    supabase.from('t1d_low_treatments')
      .select('timestamp, bg_at_treatment, treatment_type, treatment_carbs_g')
      .gte('timestamp', sevenDaysAgo.toISOString())
      .order('timestamp'),
    // Recent dose outcomes
    supabase.from('t1d_dose_outcomes')
      .select('session_id, bg_at_1h, bg_at_2h, bg_at_3h, peak_bg, nadir_bg, tir_4h_pct, outcome_rating, computed_at')
      .gte('computed_at', sevenDaysAgo.toISOString())
      .order('computed_at', { ascending: false }),
    // Current engine params
    supabase.from('t1d_engine_params').select('*').order('effective_from', { ascending: false }).limit(1).single(),
    // Full schedule
    supabase.from('t1d_school_schedule').select('*').eq('active', true).order('start_time'),
    // This week's overrides
    supabase.from('t1d_daily_overrides').select('*').gte('override_date', sevenDaysAgo.toISOString().split('T')[0]),
    // Glooko daily insulin totals
    supabase.from('glooko_insulin_totals')
      .select('timestamp, total_bolus_u, total_basal_u, total_insulin_u')
      .gte('timestamp', sevenDaysAgo.toISOString())
      .order('timestamp'),
    // Last learning for week-over-week
    supabase.from('t1d_engine_learnings')
      .select('learning_date, claude_observations')
      .lt('learning_date', today)
      .order('learning_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const egvs = egvsResult.data ?? []
  const glookoBoluses = glookoBolusResult.data ?? []
  const appDoses = appDoseResult.data ?? []
  const meals = mealResult.data ?? []
  const lows = lowsResult.data ?? []
  const outcomes = outcomesResult.data ?? []
  const params = paramsResult.data
  const schedule = scheduleResult.data ?? []
  const overrides = overridesResult.data ?? []
  const insulinTotals = insulinTotalsResult.data ?? []
  const prevLearning = prevLearningResult.data

  // ── Compute post-dose BG outcomes for this week's app sessions ───────────────

  for (const session of appDoses) {
    const existingOutcome = outcomes.find(o => o.session_id === session.id)
    if (existingOutcome) continue

    const t = new Date(session.actual_dose_timestamp ?? session.timestamp).getTime()
    const { data: postEgvs } = await supabase
      .from('dexcom_egvs')
      .select('system_time, value_mgdl')
      .gte('system_time', new Date(t + 5 * 60000).toISOString())
      .lte('system_time', new Date(t + 4 * 3600000).toISOString())
      .order('system_time')

    if (!postEgvs || postEgvs.length < 3) continue

    const bgs = postEgvs.map(e => Number(e.value_mgdl)).filter(v => !isNaN(v))
    const at1h = postEgvs.find(e => new Date(e.system_time).getTime() >= t + 55 * 60000)
    const at2h = postEgvs.find(e => new Date(e.system_time).getTime() >= t + 115 * 60000)
    const at3h = postEgvs.find(e => new Date(e.system_time).getTime() >= t + 175 * 60000)
    const peak = Math.max(...bgs)
    const nadir = Math.min(...bgs)
    const inRange = bgs.filter(v => v >= 70 && v <= 180).length
    const tirPct = bgs.length > 0 ? (inRange / bgs.length) * 100 : null

    const rating = nadir < 70 ? 'low_alarm' : peak > 250 ? 'too_high' : peak > 180 ? 'high' : 'good'

    await supabase.from('t1d_dose_outcomes').upsert({
      session_id: session.id,
      bg_at_1h: at1h ? Number(at1h.value_mgdl) : null,
      bg_at_2h: at2h ? Number(at2h.value_mgdl) : null,
      bg_at_3h: at3h ? Number(at3h.value_mgdl) : null,
      peak_bg: peak,
      nadir_bg: nadir,
      tir_4h_pct: tirPct,
      outcome_rating: rating,
    }, { onConflict: 'session_id' })

    outcomes.push({
      session_id: session.id,
      bg_at_1h: at1h ? Number(at1h.value_mgdl) : null,
      bg_at_2h: at2h ? Number(at2h.value_mgdl) : null,
      bg_at_3h: at3h ? Number(at3h.value_mgdl) : null,
      peak_bg: peak,
      nadir_bg: nadir,
      tir_4h_pct: tirPct,
      outcome_rating: rating,
      computed_at: new Date().toISOString(),
    })
  }

  // ── Compute metrics ───────────────────────────────────────────────────────────

  // 1. Overall TIR (7 days)
  const allBgs = egvs.map(e => Number(e.value_mgdl)).filter(v => !isNaN(v))
  const tir = allBgs.length > 0 ? {
    pct_low: Math.round(allBgs.filter(v => v < 70).length / allBgs.length * 100),
    pct_in_range: Math.round(allBgs.filter(v => v >= 70 && v <= 180).length / allBgs.length * 100),
    pct_high: Math.round(allBgs.filter(v => v > 180).length / allBgs.length * 100),
    avg_bg: Math.round(allBgs.reduce((a, b) => a + b, 0) / allBgs.length),
    readings: allBgs.length,
  } : null

  // 2. TIR by time of day (Central time)
  const bgByHour: Record<number, number[]> = {}
  for (const e of egvs) {
    const hour = new Date(e.system_time).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Chicago' })
    const h = parseInt(hour) % 24
    if (!bgByHour[h]) bgByHour[h] = []
    bgByHour[h].push(Number(e.value_mgdl))
  }
  const avgByPeriod = {
    morning_6_12: [6,7,8,9,10,11].flatMap(h => bgByHour[h] ?? []),
    afternoon_12_18: [12,13,14,15,16,17].flatMap(h => bgByHour[h] ?? []),
    evening_18_24: [18,19,20,21,22,23].flatMap(h => bgByHour[h] ?? []),
    overnight_0_6: [0,1,2,3,4,5].flatMap(h => bgByHour[h] ?? []),
  }
  const periodStats = Object.entries(avgByPeriod).map(([period, vals]) => ({
    period,
    avg: vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
    pct_in_range: vals.length > 0 ? Math.round(vals.filter(v => v >= 70 && v <= 180).length / vals.length * 100) : null,
  }))

  // 3. Dosing coverage: match meals to Glooko boluses by timing
  const coverageData: Array<{ date: string; offered_g: number; eaten_g: number; dosed_g: number; coverage_pct: number; context: string }> = []
  for (const meal of meals) {
    if (!meal.total_eaten_carbs || meal.total_eaten_carbs < 5) continue
    const mealTime = new Date(meal.timestamp).getTime()
    // Find Glooko bolus within ±45 min of meal
    const matchedBoluses = glookoBoluses.filter(b => {
      const d = Math.abs(new Date(b.timestamp).getTime() - mealTime)
      return d < 45 * 60000
    })
    const totalDosed = matchedBoluses.reduce((s, b) => s + Number(b.carbs_input_g ?? 0), 0)
    coverageData.push({
      date: fmtDate(meal.timestamp),
      offered_g: meal.total_offered_carbs ?? 0,
      eaten_g: meal.total_eaten_carbs,
      dosed_g: totalDosed,
      coverage_pct: totalDosed > 0 ? Math.round((totalDosed / meal.total_eaten_carbs) * 100) : 0,
      context: meal.context,
    })
  }

  // 4. Insulin timing: gap between dose session and Glooko bolus
  const timingData: Array<{ date: string; app_recommended_at: string; pump_dosed_at: string; gap_min: number }> = []
  for (const dose of appDoses) {
    if (!dose.actual_dose_grams) continue
    const doseTime = new Date(dose.actual_dose_timestamp ?? dose.timestamp).getTime()
    const matchedBolus = glookoBoluses.find(b => Math.abs(new Date(b.timestamp).getTime() - doseTime) < 30 * 60000)
    if (matchedBolus) {
      const gapMin = Math.round((new Date(matchedBolus.timestamp).getTime() - doseTime) / 60000)
      timingData.push({
        date: fmtDate(dose.timestamp),
        app_recommended_at: fmtTime(dose.timestamp),
        pump_dosed_at: fmtTime(matchedBolus.timestamp),
        gap_min: gapMin,
      })
    }
  }

  // 5. Outcome summary
  const outcomeStats = {
    good: outcomes.filter(o => o.outcome_rating === 'good').length,
    high: outcomes.filter(o => o.outcome_rating === 'high' || o.outcome_rating === 'too_high').length,
    low_alarm: outcomes.filter(o => o.outcome_rating === 'low_alarm').length,
    total: outcomes.length,
    avg_peak: outcomes.length > 0 ? Math.round(outcomes.reduce((s, o) => s + (o.peak_bg ?? 0), 0) / outcomes.length) : null,
    avg_1h_bg: outcomes.filter(o => o.bg_at_1h).length > 0
      ? Math.round(outcomes.filter(o => o.bg_at_1h).reduce((s, o) => s + (o.bg_at_1h ?? 0), 0) / outcomes.filter(o => o.bg_at_1h).length)
      : null,
    avg_2h_bg: outcomes.filter(o => o.bg_at_2h).length > 0
      ? Math.round(outcomes.filter(o => o.bg_at_2h).reduce((s, o) => s + (o.bg_at_2h ?? 0), 0) / outcomes.filter(o => o.bg_at_2h).length)
      : null,
  }

  // 6. Low treatment analysis
  const lowsByHour: Record<number, number> = {}
  for (const l of lows) {
    const h = new Date(l.timestamp).getHours()
    lowsByHour[h] = (lowsByHour[h] ?? 0) + 1
  }
  const peakLowHour = Object.entries(lowsByHour).sort((a, b) => b[1] - a[1])[0]

  // 7. Daily insulin totals
  const avgDailyInsulin = insulinTotals.length > 0
    ? Math.round(insulinTotals.reduce((s, t) => s + Number(t.total_insulin_u ?? 0), 0) / insulinTotals.length * 10) / 10
    : null

  // ── Build prompt ─────────────────────────────────────────────────────────────

  const prompt = `You are the dosing analyst for Brooks, a child with Type 1 diabetes on Omnipod 5 + Dexcom G7 + Fiasp.

Analyze the past 7 days of data and produce a comprehensive insight report. This is the baseline for all dosing decisions.

Today: ${today}
Previous insight (for comparison): ${prevLearning ? `${prevLearning.learning_date}: ${prevLearning.claude_observations?.slice(0, 200)}...` : 'None'}

## Current Engine Parameters
${params ? `Pre-bolus: ${(params.pre_bolus_pct * 100).toFixed(0)}% · Lead time: ${params.pre_bolus_lead_min}min
Follow-up coverage: ${(params.follow_up_coverage_pct * 100).toFixed(0)}%
Activity reduction: ${(params.activity_reduction_pct * 100).toFixed(0)}% within ${params.activity_window_min}min
ICR: ${params.current_icr} g/unit · ISF: ${params.current_isf} · DIA: ${params.current_dia}h · Target: ${params.target_bg} mg/dL
Insulin: ${params.insulin_type}
${params.clinical_notes ? `Clinical notes: ${params.clinical_notes}` : ''}` : 'Not available'}

## Time In Range (7 days, ${allBgs.length} readings)
${tir ? `Overall: ${tir.pct_in_range}% in range (70-180) · ${tir.pct_low}% low · ${tir.pct_high}% high · avg ${tir.avg_bg} mg/dL` : 'No CGM data'}
${periodStats.map(p => `${p.period}: avg ${p.avg ?? '?'} mg/dL, ${p.pct_in_range ?? '?'}% in range`).join('\n')}

## Post-Dose BG Outcomes (${outcomeStats.total} sessions)
${outcomeStats.good} good / ${outcomeStats.high} high / ${outcomeStats.low_alarm} lows
Avg peak: ${outcomeStats.avg_peak ?? '?'} mg/dL · Avg 1h BG: ${outcomeStats.avg_1h_bg ?? '?'} · Avg 2h BG: ${outcomeStats.avg_2h_bg ?? '?'}
Individual sessions:
${outcomes.slice(-7).map(o => {
  const session = appDoses.find(d => d.id === o.session_id)
  return `  ${session ? fmtDate(session.timestamp) : '?'}: peak ${o.peak_bg} / 1h ${o.bg_at_1h ?? '?'} / 2h ${o.bg_at_2h ?? '?'} → ${o.outcome_rating}`
}).join('\n')}

## Dosing Coverage (carbs eaten vs entered into pump)
${coverageData.length > 0 ? coverageData.map(c =>
  `  ${c.date} (${c.context}): offered ${c.offered_g}g, eaten ${c.eaten_g}g, pump received ${c.dosed_g}g → ${c.coverage_pct}% coverage`
).join('\n') : 'No matched meal-to-bolus data'}
${coverageData.length > 0 ? `Average coverage: ${Math.round(coverageData.reduce((s, c) => s + c.coverage_pct, 0) / coverageData.length)}%` : ''}

## Insulin Timing (app recommendation → actual pump bolus)
${timingData.length > 0 ? timingData.map(t => `  ${t.date}: app at ${t.app_recommended_at} → pump at ${t.pump_dosed_at} (${t.gap_min > 0 ? '+' : ''}${t.gap_min} min)`).join('\n') : 'No matched timing data'}
${timingData.length > 0 ? `Average gap: ${Math.round(timingData.reduce((s, t) => s + t.gap_min, 0) / timingData.length)} min` : ''}

## Glooko Pump Boluses (7 days, raw pump data)
${glookoBoluses.slice(-14).map(b => `  ${fmtDate(b.timestamp)} ${fmtTime(b.timestamp)}: ${b.insulin_delivered_u}U for ${b.carbs_input_g ?? 0}g (BG ${b.bg_input_mgdl ?? '?'} at dose)`).join('\n')}

## Daily Insulin Totals
${insulinTotals.map(t => `  ${fmtDate(t.timestamp)}: ${t.total_bolus_u}U bolus + ${t.total_basal_u}U basal = ${t.total_insulin_u}U total`).join('\n')}
${avgDailyInsulin ? `Average: ${avgDailyInsulin}U/day` : ''}

## Low Treatments (${lows.length} total)
${lows.map(l => `  ${fmtDate(l.timestamp)} ${fmtTime(l.timestamp)}: BG ${l.bg_at_treatment} → ${l.treatment_type} ${l.treatment_carbs_g ?? '?'}g`).join('\n')}
${peakLowHour ? `Most lows at: ${peakLowHour[0]}:00 (${peakLowHour[1]} occurrences)` : ''}

## Schedule Context
${schedule.filter(s => s.event_type !== 'bedtime').map(s => `  Day ${s.day_of_week}: ${s.event_type} ${s.start_time}-${s.end_time} (${s.activity_level ?? 'normal'})${s.notes ? ' — ' + s.notes : ''}`).join('\n')}

## Daily Overrides This Week
${overrides.length > 0 ? overrides.map(o => `  ${o.override_date}: ${o.camp_cancelled ? 'NO CAMP' : ''}${o.pe_cancelled ? ' PE cancelled' : ''}${o.notes ? ' ' + o.notes : ''}`).join('\n') : 'None'}

---

Produce a comprehensive analysis. Reference specific numbers throughout. Be direct and honest about what the data shows.

Return ONLY valid JSON:
{
  "headline": "2-sentence executive summary of the week",
  "observations": [
    {"topic": "Time in Range", "finding": "...", "evidence": "specific numbers"},
    {"topic": "Post-meal control", "finding": "...", "evidence": "..."},
    {"topic": "Dosing coverage", "finding": "...", "evidence": "..."},
    {"topic": "Insulin timing", "finding": "...", "evidence": "..."},
    {"topic": "Low treatments", "finding": "...", "evidence": "..."},
    {"topic": "Activity impact", "finding": "...", "evidence": "..."}
  ],
  "suggestions": [
    {"param": "pre_bolus_pct", "current": 0.40, "suggested": 0.45, "confidence": "high", "rationale": "..."}
  ],
  "pump_setting_flag": null,
  "data_quality": "note about what data is complete or missing",
  "plain_summary": "3-4 paragraph plain English summary suitable for email"
}`

  let result: {
    headline: string
    observations: Array<{ topic: string; finding: string; evidence: string }>
    suggestions: Array<{ param: string; current: number; suggested: number; confidence: string; rationale: string }>
    pump_setting_flag: string | null
    data_quality: string
    plain_summary: string
  }

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (msg.content[0] as { type: string; text: string }).text.trim()
    result = JSON.parse(raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''))
  } catch (e) {
    result = {
      headline: 'Analysis unavailable — insufficient data.',
      observations: [],
      suggestions: [],
      pump_setting_flag: null,
      data_quality: `${allBgs.length} CGM readings, ${glookoBoluses.length} pump boluses, ${meals.length} meal events available.`,
      plain_summary: 'Could not generate analysis today.',
    }
  }

  // ── Save to DB ────────────────────────────────────────────────────────────────

  const obsText = result.observations.map(o => `${o.topic}: ${o.finding} (${o.evidence})`).join('\n\n')

  const { data: learning } = await supabase
    .from('t1d_engine_learnings')
    .upsert({
      learning_date: today,
      claude_observations: `${result.headline}\n\n${obsText}`,
      claude_suggestions: result.suggestions,
    }, { onConflict: 'learning_date' })
    .select('id')
    .single()

  // ── Send email ────────────────────────────────────────────────────────────────

  if (process.env.RESEND_API_KEY) {
    const emailHtml = `
<html><body style="font-family:sans-serif;background:#0a0a0a;color:#e5e5e5;padding:24px;max-width:600px;margin:0 auto">
<h2 style="color:#2dd4bf;margin-bottom:4px">Brooks · T1D Insights</h2>
<p style="color:#6b7280;margin-top:0;font-size:13px">${fmtDate(today)} · 7-day analysis</p>

<div style="background:#141414;border-radius:12px;padding:16px;margin:16px 0;border:1px solid #262626">
<p style="margin:0;font-size:15px;line-height:1.6">${result.headline}</p>
</div>

${tir ? `<div style="background:#141414;border-radius:12px;padding:16px;margin:16px 0;border:1px solid #262626">
<p style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px">TIME IN RANGE (7 days)</p>
<p style="font-size:24px;font-weight:bold;margin:0;color:#2dd4bf">${tir.pct_in_range}%</p>
<p style="font-size:12px;color:#6b7280;margin:4px 0 0">in range (70-180) · ${tir.pct_low}% low · ${tir.pct_high}% high · avg ${tir.avg_bg} mg/dL</p>
</div>` : ''}

<div style="background:#141414;border-radius:12px;padding:16px;margin:16px 0;border:1px solid #262626">
<p style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px">OBSERVATIONS</p>
${result.observations.map(o => `
<div style="margin-bottom:12px">
<p style="color:#9ca3af;font-size:11px;font-weight:600;text-transform:uppercase;margin:0 0 2px">${o.topic}</p>
<p style="margin:0;font-size:13px;line-height:1.5">${o.finding}</p>
<p style="margin:2px 0 0;font-size:11px;color:#6b7280">${o.evidence}</p>
</div>`).join('')}
</div>

${result.suggestions.length > 0 ? `<div style="background:#141414;border-radius:12px;padding:16px;margin:16px 0;border:1px solid #2dd4bf44">
<p style="color:#2dd4bf;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px">SUGGESTED TWEAKS</p>
${result.suggestions.map(s => `
<div style="margin-bottom:8px">
<p style="margin:0;font-size:13px"><strong style="color:#2dd4bf">${s.param}</strong>: ${s.current} → ${s.suggested} <span style="color:#6b7280;font-size:11px">(${s.confidence} confidence)</span></p>
<p style="margin:2px 0 0;font-size:12px;color:#9ca3af">${s.rationale}</p>
</div>`).join('')}
</div>` : ''}

<p style="color:#6b7280;font-size:11px;margin:24px 0 0">Open the Brooks app → Engine → Insights to approve or reject changes.</p>
</body></html>`

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Brooks T1D <onboarding@resend.dev>',
        to: 'alexhbrown0@gmail.com',
        subject: `Brooks T1D Insights — ${today} · ${tir ? `${tir.pct_in_range}% TIR` : 'Weekly analysis'}`,
        html: emailHtml,
      }),
    }).catch(() => null) // don't fail if email fails
  }

  return NextResponse.json({
    learning_id: learning?.id,
    today,
    tir: tir ? `${tir.pct_in_range}% in range` : 'no data',
    outcomes_computed: outcomes.length,
    observations: result.observations.length,
    suggestions: result.suggestions.length,
    email_sent: !!process.env.RESEND_API_KEY,
  })
}
