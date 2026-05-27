import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { claude } from '@/lib/claude/client'
import { getEgvsInRange } from '@/lib/dexcom/client'
import {
  buildLearningSystemPrompt,
  buildLearningUserContext,
  type DayMealSummary,
  type FoodAggregateSummary,
  type LearningPromptInput,
} from '@/lib/claude/prompts/t1d-learning'
import { getCurrentEngineParams } from '@/lib/supabase/queries/t1d'

export async function GET(req: NextRequest) {
  const cronAuth = req.headers.get('authorization')
  const manualSecret = req.headers.get('x-cron-secret')
  const secret = cronAuth === `Bearer ${process.env.CRON_SECRET}` || manualSecret === process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const today = new Date().toISOString().split('T')[0]
  const todayStart = new Date(`${today}T00:00:00Z`)
  const todayEnd = new Date(`${today}T23:59:59Z`)

  // Load everything in parallel
  const [params, mealsResult, lowsResult, trendResult, foodResult, rejectedResult] = await Promise.all([
    getCurrentEngineParams(),

    supabase
      .from('t1d_meal_events')
      .select(`
        id, context, items_offered, items_eaten,
        total_offered_carbs, total_fat_g, total_protein_g, fpu_count, timestamp,
        t1d_dose_sessions ( actual_dose_grams, recommended_extended_grams, actual_dose_timestamp ),
        t1d_dose_outcomes ( outcome_rating, peak_bg, peak_at_minutes, score_overall )
      `)
      .gte('timestamp', todayStart.toISOString())
      .lte('timestamp', todayEnd.toISOString()),

    supabase
      .from('t1d_low_treatments')
      .select('bg_at_treatment, treatment_carbs_g, created_at')
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString()),

    supabase
      .from('t1d_dose_outcomes')
      .select('outcome_rating, computed_at, t1d_dose_sessions ( timestamp )')
      .gte('computed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .not('outcome_rating', 'is', null),

    supabase
      .from('t1d_food_repo')
      .select('name, gi_estimate, learned_strategy')
      .eq('active', true)
      .not('learned_strategy', 'is', null),

    supabase
      .from('t1d_engine_learnings')
      .select('claude_suggestions, action_taken, alexandra_notes, created_at')
      .eq('action_taken', 'rejected')
      .gte('created_at', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()),
  ])

  // Build meal summaries with BG traces
  const meals: DayMealSummary[] = []
  for (const meal of (mealsResult.data ?? [])) {
    const session = (meal.t1d_dose_sessions as unknown[])?.[0] as Record<string, unknown> | undefined
    const outcome = (meal.t1d_dose_outcomes as unknown[])?.[0] as Record<string, unknown> | undefined

    let bgTrace: { minutes_after: number; bg: number }[] = []
    if (session?.actual_dose_timestamp) {
      const doseTime = new Date(session.actual_dose_timestamp as string)
      const traceEnd = new Date(doseTime.getTime() + 4 * 60 * 60 * 1000)
      const egvs = await getEgvsInRange(doseTime, traceEnd)
      bgTrace = egvs
        .filter(e => e.value_mgdl != null)
        .filter((_, i) => i % 3 === 0) // sample every 15 min (every 3rd 5-min reading)
        .map(e => ({
          minutes_after: Math.round((new Date(e.system_time).getTime() - doseTime.getTime()) / 60000),
          bg: e.value_mgdl!,
        }))
    }

    const items = ((meal.items_eaten || meal.items_offered) as Array<{ name: string }> ?? [])
      .map((i) => i.name)
      .join(', ')

    meals.push({
      context: meal.context as string,
      items,
      total_carbs: (meal.total_offered_carbs as number) ?? 0,
      total_fat: (meal.total_fat_g as number) ?? 0,
      total_protein: (meal.total_protein_g as number) ?? 0,
      fpu_count: (meal.fpu_count as number) ?? 0,
      dose_given: session ? (session.actual_dose_grams as number) : null,
      extended_given: session ? (session.recommended_extended_grams as number | null) : null,
      outcome_rating: outcome ? (outcome.outcome_rating as string) : null,
      peak_bg: outcome ? (outcome.peak_bg as number | null) : null,
      peak_at_minutes: outcome ? (outcome.peak_at_minutes as number | null) : null,
      score_overall: outcome ? (outcome.score_overall as string | null) : null,
      bg_trace: bgTrace,
    })
  }

  // 7-day trend grouped by date
  const trendByDate: Record<string, { good: number; total: number }> = {}
  for (const row of (trendResult.data ?? [])) {
    const session = (row.t1d_dose_sessions as unknown) as { timestamp: string } | null
    if (!session) continue
    const d = new Date(session.timestamp).toISOString().split('T')[0]
    if (!trendByDate[d]) trendByDate[d] = { good: 0, total: 0 }
    trendByDate[d].total++
    if (row.outcome_rating === 'good') trendByDate[d].good++
  }
  const recentOutcomeTrend = Object.entries(trendByDate)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 7)
    .map(([date, { good, total }]) => ({
      date,
      pct_good: total > 0 ? good / total : 0,
      meals_logged: total,
    }))

  // Food aggregates from learned_strategy
  const foodAggregates: FoodAggregateSummary[] = (foodResult.data ?? [])
    .filter((f) => f.learned_strategy && (f.learned_strategy as { n_meals: number }).n_meals >= 3)
    .map((f) => {
      const s = f.learned_strategy as {
        n_meals: number; pct_good: number; avg_peak_mgdl: number | null
        avg_peak_minutes: number | null; dose_pct: number
        extended_grams: number | null; extended_hours: number | null
      }
      const stratDesc = `${(s.dose_pct * 100).toFixed(0)}% upfront${s.extended_grams ? ` + ${s.extended_grams}g extended/${s.extended_hours}h` : ''}`
      return {
        name: f.name as string,
        n_meals: s.n_meals,
        pct_good: s.pct_good,
        avg_peak_mgdl: s.avg_peak_mgdl,
        avg_peak_minutes: s.avg_peak_minutes,
        gi_estimate: f.gi_estimate as number | null,
        current_strategy: stratDesc,
      }
    })

  // Rejected suggestions in last 60 days
  const rejectedSuggestions: LearningPromptInput['rejectedSuggestions'] = []
  for (const row of (rejectedResult.data ?? [])) {
    const suggestions = row.claude_suggestions as Array<{ param: string; suggested_value: number }> | null
    if (!suggestions) continue
    for (const s of suggestions) {
      rejectedSuggestions.push({
        param: s.param,
        suggested: s.suggested_value,
        rejected_on: new Date(row.created_at as string).toISOString().split('T')[0],
        reason: row.alexandra_notes as string | null,
      })
    }
  }

  // Lows
  const lows = (lowsResult.data ?? []).map((l) => ({
    bg: l.bg_at_treatment as number,
    treatment_carbs: l.treatment_carbs_g as number,
    minutes_after_meal: null,
    outcome: null,
  }))

  const input: LearningPromptInput = {
    date: today,
    meals,
    lows,
    params,
    recentOutcomeTrend,
    foodAggregates,
    rejectedSuggestions,
  }

  const systemPrompt = buildLearningSystemPrompt()
  const userContext = buildLearningUserContext(input)

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContext }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  const result = JSON.parse(json)

  await supabase.from('t1d_engine_learnings').insert({
    learning_date: today,
    meals_logged: meals.length,
    data_quality_note: result.data_quality?.note ?? null,
    claude_observations: result.observations?.join('\n') ?? null,
    claude_suggestions: result.suggested_param_changes ?? null,
    action_taken: null,
  })

  return NextResponse.json({ ok: true, date: today, meals_reviewed: meals.length, result })
}
