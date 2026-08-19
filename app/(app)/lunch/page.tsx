import { getCentralDayStartUTC, getCentralDateStr, getCentralTime } from '@/lib/utils/central-time'
import { createServerClient } from '@/lib/supabase/server'
import { getLatestEgvs } from '@/lib/dexcom/client'
import { dosingRowsForDay } from '@/lib/t1d/day-schedule'
import { LunchFlow } from '@/components/t1d/lunch-flow'
import type { T1dMealEvent, T1dDoseSession, T1dCafeteriaMenuItem } from '@/types/health'

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
  const totalEaten = meal.total_eaten_carbs ?? 0
  const totalDosed = allSessions.reduce((s, d) => s + (Number(d.actual_dose_grams) || 0), 0)
  if (totalEaten > 0 && totalDosed < totalEaten - COVERAGE_TOLERANCE_G) return 'followup_pending'
  return 'complete'
}

export default async function LunchPage() {
  const supabase = createServerClient()
  const todayStart = getCentralDayStartUTC()
  const todayDate = getCentralDateStr()

  const [mealRes, egvs, overrideRes] = await Promise.all([
    supabase
      .from('t1d_meal_events')
      .select('*')
      .eq('context', 'school_lunch')
      .gte('timestamp', todayStart.toISOString())
      .order('timestamp', { ascending: false })
      .limit(1),
    getLatestEgvs(2).catch(() => []),
    supabase.from('t1d_daily_overrides').select('*').eq('override_date', todayDate).limit(1),
  ])
  const scheduleRows = dosingRowsForDay(getCentralTime().dayOfWeek)

  const meal = (mealRes.data?.[0] as T1dMealEvent) ?? null

  // For cafeteria meals the nurse picks the plate at dose time, so load today's menu + staples.
  let cafeteriaMenu: T1dCafeteriaMenuItem[] = []
  let stapleNames: string[] = []
  if (meal?.is_cafeteria) {
    const [menuRes, allMenuRes] = await Promise.all([
      supabase.from('t1d_cafeteria_menu').select('*').eq('menu_date', todayDate).order('carbs_g', { ascending: false }),
      supabase.from('t1d_cafeteria_menu').select('menu_date, name'),
    ])
    cafeteriaMenu = (menuRes.data ?? []) as T1dCafeteriaMenuItem[]
    const allMenu = (allMenuRes.data ?? []) as Array<{ menu_date: string; name: string }>
    const allDates = new Set(allMenu.map(r => r.menu_date))
    const nameDates = new Map<string, Set<string>>()
    for (const r of allMenu) {
      if (!nameDates.has(r.name)) nameDates.set(r.name, new Set())
      nameDates.get(r.name)!.add(r.menu_date)
    }
    stapleNames = allDates.size > 0
      ? [...nameDates.entries()].filter(([, dates]) => dates.size / allDates.size >= 0.5).map(([name]) => name)
      : []
  }

  const egv = egvs[0]
  const prevEgv = egvs[1]
  const bgAge = egv ? Date.now() - new Date(egv.system_time).getTime() : Infinity
  const bgGapMs = egv && prevEgv
    ? new Date(egv.system_time).getTime() - new Date(prevEgv.system_time).getTime()
    : Infinity
  const bgDelta = egv && prevEgv && bgGapMs <= 10 * 60 * 1000 && egv.value_mgdl != null && prevEgv.value_mgdl != null
    ? Math.round(egv.value_mgdl - prevEgv.value_mgdl)
    : null
  const bg = egv && bgAge <= 15 * 60 * 1000 ? { value_mgdl: egv.value_mgdl, trend: egv.trend, delta: bgDelta } : null

  let session: T1dDoseSession | null = null
  let followUpSession: T1dDoseSession | null = null
  let allSessions: T1dDoseSession[] = []

  if (meal) {
    const { data: sessions } = await supabase
      .from('t1d_dose_sessions')
      .select('*')
      .eq('meal_event_id', meal.id)
      .order('created_at', { ascending: true })

    allSessions = (sessions ?? []) as T1dDoseSession[]

    // Use the LATEST unconfirmed session; treat stale wait_and_see as expired
    const latestUnconfirmed = !meal?.items_eaten
      ? [...allSessions].reverse().find(s => s.actual_dose_grams == null)
      : null
    const staleWaitAndSee = latestUnconfirmed?.wait_and_see &&
      Date.now() - new Date(latestUnconfirmed.timestamp).getTime() > 30 * 60 * 1000
    session = staleWaitAndSee ? null : (latestUnconfirmed ?? allSessions[0] ?? null)

    const postEatingSessions = meal?.items_eaten ? allSessions.filter(s => s.entered_by === 'followup') : []
    followUpSession = postEatingSessions.length > 0 ? postEatingSessions[postEatingSessions.length - 1] : null
  }

  const preDoseSessions = allSessions.filter(s => s.entered_by !== 'followup' && s.actual_dose_grams != null)
  const totalDosedCarbs = allSessions.reduce((s, d) => s + (Number(d.actual_dose_grams) || 0), 0)

  return (
    <div className="px-4 pt-5 pb-6">
      <LunchFlow
        initialData={{
          meal,
          session,
          followUpSession,
          preDoseSessions,
          bg,
          schedule: scheduleRows as Array<{ event_type: string; start_time: string; end_time: string; day_of_week: number }>,
          override: (overrideRes.data?.[0] as { pe_cancelled?: boolean; pe_start_time?: string | null }) ?? null,
          phase: inferPhase(meal, session, followUpSession, allSessions),
          totalDosedCarbs,
          cafeteriaMenu,
          stapleNames,
        }}
      />
    </div>
  )
}
