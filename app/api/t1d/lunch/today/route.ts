import { getCentralDayStartUTC, getCentralDateStr } from '@/lib/utils/central-time'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getLatestEgvs } from '@/lib/dexcom/client'
import type { T1dMealEvent, T1dDoseSession } from '@/types/health'

export const dynamic = 'force-dynamic'

function inferPhase(
  meal: T1dMealEvent | null,
  session: T1dDoseSession | null,
  followUp: T1dDoseSession | null
) {
  if (!meal) return 'no_lunch'
  if (!session) return 'packed'
  if (session.actual_dose_grams == null) return 'pre_dose_ready'
  if (!meal.items_eaten) return 'eating'
  if (!followUp) return 'followup_pending'
  if (followUp.actual_dose_grams == null) return 'followup_ready'
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
  const bg = egvs[0] ? { value_mgdl: egvs[0].value_mgdl, trend: egvs[0].trend } : null

  let session: T1dDoseSession | null = null
  let followUp: T1dDoseSession | null = null

  if (meal) {
    const { data: sessions } = await supabase
      .from('t1d_dose_sessions')
      .select('*')
      .eq('meal_event_id', meal.id)
      .order('created_at', { ascending: true })

    const all = (sessions ?? []) as T1dDoseSession[]
    session = all[0] ?? null
    followUp = all.length > 1 ? all[all.length - 1] : null
  }

  return NextResponse.json({
    meal,
    session,
    follow_up_session: followUp,
    bg,
    schedule: schedRes.data ?? [],
    override: overrideRes.data?.[0] ?? null,
    phase: inferPhase(meal, session, followUp),
  })
}
