import { getCentralDateStr } from '@/lib/utils/central-time'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

// Vercel cron: runs at 7pm daily
// Also callable manually via POST with cron secret
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? new URL(req.url).searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const today = getCentralDateStr()
  const todayStart = `${today}T00:00:00Z`
  const todayEnd = `${today}T23:59:59Z`
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000).toISOString()

  // Gather today's data
  const [sessionsResult, outcomesResult, bolusResult, paramsResult] = await Promise.all([
    supabase
      .from('t1d_dose_sessions')
      .select('*')
      .gte('timestamp', todayStart)
      .lte('timestamp', todayEnd)
      .order('timestamp'),
    supabase
      .from('t1d_dose_outcomes')
      .select('*, t1d_dose_sessions(timestamp, meal_gi_category, starting_bg, low_treatment_carbs)')
      .gte('computed_at', sevenDaysAgo)
      .order('computed_at', { ascending: false })
      .limit(30),
    supabase
      .from('glooko_bolus')
      .select('timestamp, carbs_input_g, insulin_delivered_u, carbs_ratio')
      .gte('timestamp', todayStart)
      .order('timestamp'),
    supabase
      .from('t1d_engine_params')
      .select('*')
      .order('effective_from', { ascending: false })
      .limit(1)
      .single(),
  ])

  const sessions = sessionsResult.data ?? []
  const recentOutcomes = outcomesResult.data ?? []
  const todayBoluses = bolusResult.data ?? []
  const params = paramsResult.data

  // Compute outcomes for today's sessions that don't have them yet
  const computedToday: Array<{
    session_id: string
    bg_at_1h: number | null
    bg_at_2h: number | null
    peak_bg: number | null
    nadir_bg: number | null
    outcome_rating: string
  }> = []

  for (const session of sessions) {
    const sessionTime = new Date(session.timestamp).getTime()

    // Pull BG readings from t+5min to t+4h
    const { data: egvs } = await supabase
      .from('dexcom_egvs')
      .select('system_time, value_mgdl')
      .gte('system_time', new Date(sessionTime + 5 * 60000).toISOString())
      .lte('system_time', new Date(sessionTime + 4 * 3600000).toISOString())
      .order('system_time')

    if (!egvs || egvs.length < 3) continue

    const bgs = egvs.map(e => Number(e.value_mgdl)).filter(v => !isNaN(v))
    const at1h = egvs.find(e => new Date(e.system_time).getTime() >= sessionTime + 55 * 60000)
    const at2h = egvs.find(e => new Date(e.system_time).getTime() >= sessionTime + 115 * 60000)
    const peakBg = Math.max(...bgs)
    const nadirBg = Math.min(...bgs)

    const outcome = peakBg > 250 ? 'too_high'
      : peakBg > 180 ? 'high'
      : nadirBg < 70 ? 'low_alarm'
      : 'good'

    computedToday.push({
      session_id: session.id,
      bg_at_1h: at1h ? Number(at1h.value_mgdl) : null,
      bg_at_2h: at2h ? Number(at2h.value_mgdl) : null,
      peak_bg: peakBg,
      nadir_bg: nadirBg,
      outcome_rating: outcome,
    })

    await supabase.from('t1d_dose_outcomes').upsert({
      session_id: session.id,
      bg_at_1h: at1h ? Number(at1h.value_mgdl) : null,
      bg_at_2h: at2h ? Number(at2h.value_mgdl) : null,
      peak_bg: peakBg,
      nadir_bg: nadirBg,
      outcome_rating: outcome,
    }, { onConflict: 'session_id' })
  }

  // Recent outcome trend (last 7 days)
  const outcomeStats = {
    good: recentOutcomes.filter(o => o.outcome_rating === 'good').length,
    high: recentOutcomes.filter(o => o.outcome_rating === 'high' || o.outcome_rating === 'too_high').length,
    low: recentOutcomes.filter(o => o.outcome_rating === 'low_alarm').length,
    total: recentOutcomes.length,
  }

  const dataQualityNote = sessions.length === 0
    ? 'No dose sessions logged today — pattern analysis may be incomplete.'
    : `${sessions.length} dose session(s) logged today.`

  const prompt = `You are reviewing today's diabetes management data for Brooks, a child with T1D on Omnipod 5 + Dexcom G7 + Fiasp.

Today: ${today}
${dataQualityNote}

Current engine parameters:
${params ? `- Pre-bolus %: ${(params.pre_bolus_pct * 100).toFixed(0)}%
- Pre-bolus lead: ${params.pre_bolus_lead_min} min
- Activity reduction: ${(params.activity_reduction_pct * 100).toFixed(0)}%
- ICR: ${params.current_icr} g/unit (morning), ${JSON.stringify(params.icr_segments ?? [])}
- ISF: ${params.current_isf}, DIA: ${params.current_dia}h` : 'Not available'}

Today's sessions and outcomes:
${computedToday.length > 0 ? computedToday.map(o =>
  `- Session: peak ${o.peak_bg} mg/dL, nadir ${o.nadir_bg} mg/dL, 1h BG ${o.bg_at_1h ?? '?'}, 2h BG ${o.bg_at_2h ?? '?'} → ${o.outcome_rating}`
).join('\n') : 'No outcomes computed today (no matching CGM data)'}

Today's pump boluses:
${todayBoluses.length > 0 ? todayBoluses.map(b =>
  `- ${new Date(b.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}: ${b.insulin_delivered_u}U for ${b.carbs_input_g ?? 0}g (ICR ${b.carbs_ratio})`
).join('\n') : 'None'}

Last 7 days outcome trend: ${outcomeStats.total} meals — ${outcomeStats.good} good, ${outcomeStats.high} high, ${outcomeStats.low} lows

Identify 1-3 specific, actionable observations. For each observation, suggest a concrete parameter change if warranted. Be direct and specific — reference actual numbers.

${params?.clinical_notes ? `Clinical notes to keep in mind:\n${params.clinical_notes}` : ''}

Return ONLY valid JSON:
{
  "observations": "plain text summary of what you noticed today",
  "suggestions": [
    {
      "param": "pre_bolus_pct",
      "current": 0.40,
      "suggested": 0.45,
      "confidence": "medium",
      "rationale": "..."
    }
  ],
  "data_quality": "note about data completeness",
  "pump_setting_flag": null
}`

  let claudeResult: {
    observations: string
    suggestions: Array<{ param: string; current: number; suggested: number; confidence: string; rationale: string }>
    data_quality: string
    pump_setting_flag: string | null
  }

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (msg.content[0] as { type: string; text: string }).text.trim()
    claudeResult = JSON.parse(raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''))
  } catch {
    claudeResult = {
      observations: 'Unable to generate observations today.',
      suggestions: [],
      data_quality: dataQualityNote,
      pump_setting_flag: null,
    }
  }

  const { data: learning } = await supabase
    .from('t1d_engine_learnings')
    .insert({
      learning_date: today,
      claude_observations: claudeResult.observations,
      claude_suggestions: claudeResult.suggestions,
    })
    .select('id')
    .single()

  return NextResponse.json({
    learning_id: learning?.id,
    outcomes_computed: computedToday.length,
    ...claudeResult,
  })
}
