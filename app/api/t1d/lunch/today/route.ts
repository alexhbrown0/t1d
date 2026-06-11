import { getCentralDayStartUTC, getCentralDateStr } from '@/lib/utils/central-time'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getLatestEgvs } from '@/lib/dexcom/client'
import type { T1dMealEvent, T1dDoseSession } from '@/types/health'

export const dynamic = 'force-dynamic'

const COVERAGE_TOLERANCE_G = 5

function inferPhase(
  meal: T1dMealEvent | null,
  session: T1dDoseSession | null,
  followUp: T1dDoseSession | null,
  allSessions: T1dDoseSession[]
) {
  if (!meal) return 'no_lunch'
  if (!session) return 'packed'
  if (session.actual_dose_grams == null) return 'pre_dose_ready'
  if (!meal.items_eaten) return 'eating'
  if (!followUp) return 'followup_pending'
  if (followUp.actual_dose_grams == null) return 'followup_ready'

  // Only complete if carbs are actually covered
  const totalEaten = meal.total_eaten_carbs ?? 0
  const totalDosed = allSessions.reduce((s, d) => s + (Number(d.actual_dose_grams) || 0), 0)
  if (totalEaten > 0 && totalDosed < totalEaten - COVERAGE_TOLERANCE_G) return 'followup_pending'

  return 'complete'
}

export async function GET() {
  const supabase = createServerClient()
  const todayStart = getCentralDayStartUTC()
  const todayDate = getCentralDateStr()

  const [mealRes, egvs, schedRes, overrideRes] = await Promise.all([
    supabase
      .from('t1d_meal_events')
      .select('*')
      .eq('context', 'school_lunch')
      .gte('timestamp', todayStart.toISOString())
      .order('timestamp', { ascending: false })
      .limit(1),
    getLatestEgvs(1).catch(() => []),
    supabase
      .from('t1d_school_schedule')
      .select('*')
      .eq('active', true)
      .order('start_time'),
    supabase
      .from('t1d_daily_overrides')
      .select('*')
      .eq('override_date', todayDate)
      .limit(1),
  ])

  const meal = (mealRes.data?.[0] as T1dMealEvent) ?? null
  const egv = egvs[0]
  const bgAge = egv ? Date.now() - new Date(egv.system_time).getTime() : Infinity
  const bg = egv && bgAge <= 15 * 60 * 1000 ? { value_mgdl: egv.value_mgdl, trend: egv.trend } : null

  let session: T1dDoseSession | null = null
  let followUp: T1dDoseSession | null = null
  let allSessions: T1dDoseSession[] = []

  if (meal) {
    const { data: sessions } = await supabase
      .from('t1d_dose_sessions')
      .select('*')
      .eq('meal_event_id', meal.id)
      .order('created_at', { ascending: true })

    allSessions = (sessions ?? []) as T1dDoseSession[]

    // Use latest unconfirmed session; treat stale wait_and_see as expired
    const latestUnconfirmed = !meal?.items_eaten
      ? [...allSessions].reverse().find(s => s.actual_dose_grams == null)
      : null
    const staleWaitAndSee = latestUnconfirmed?.wait_and_see &&
      Date.now() - new Date(latestUnconfirmed.timestamp).getTime() > 30 * 60 * 1000
    session = staleWaitAndSee ? null : (latestUnconfirmed ?? allSessions[0] ?? null)

    // Follow-up is the last session that was created after eating was recorded
    // (entered_by = 'followup' or it's the last session when items_eaten is set)
    const postEatingSessions = meal?.items_eaten ? allSessions.filter(s => s.entered_by === 'followup') : []
    followUp = postEatingSessions.length > 0 ? postEatingSessions[postEatingSessions.length - 1] : null
  }

  const preDoseSessions = allSessions.filter(s => s.entered_by !== 'followup' && s.actual_dose_grams != null)
  const totalDosed = allSessions.reduce((s, d) => s + (Number(d.actual_dose_grams) || 0), 0)

  return NextResponse.json({
    meal,
    session,
    follow_up_session: followUp,
    pre_dose_sessions: preDoseSessions,
    bg,
    schedule: schedRes.data ?? [],
    override: overrideRes.data?.[0] ?? null,
    phase: inferPhase(meal, session, followUp, allSessions),
    total_dosed_carbs: totalDosed,
  })
}
