import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/t1d/app-header'
import { BgCard } from '@/components/t1d/bg-card'
import { InsightTile } from '@/components/t1d/insight-tile'
import { QuickActions } from '@/components/t1d/quick-actions'
import { NextUpCard } from '@/components/t1d/next-up-card'
import type { T1dMealEvent, T1dDoseSession } from '@/types/health'

export const dynamic = 'force-dynamic'

export default async function NowPage() {
  const supabase = createServerClient()

  const now = new Date()
  const isWeekday = now.getDay() >= 1 && now.getDay() <= 5
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayDay = now.getDay()
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`

  const [egvsResult, scheduleResult, lunchResult] = await Promise.all([
    supabase
      .from('dexcom_egvs')
      .select('*')
      .order('system_time', { ascending: false })
      .limit(36),
    supabase
      .from('t1d_school_schedule')
      .select('*')
      .eq('active', true)
      .order('start_time', { ascending: true }),
    isWeekday
      ? supabase
          .from('t1d_meal_events')
          .select('id, total_offered_carbs, items_eaten')
          .eq('context', 'school_lunch')
          .gte('timestamp', todayStart.toISOString())
          .order('timestamp', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] }),
  ])

  const egvs = egvsResult.data ?? []
  const schedule = scheduleResult.data ?? []
  const nextEvent = schedule.find(
    (s) => s.day_of_week === todayDay && s.start_time > nowTime
  ) ?? null

  // Determine lunch tile status for weekdays
  let lunchPhase: 'none' | 'packed' | 'dosed' | 'done' = 'none'
  let lunchCarbs: number | null = null

  if (isWeekday && lunchResult.data && lunchResult.data.length > 0) {
    const meal = lunchResult.data[0] as Pick<T1dMealEvent, 'id' | 'total_offered_carbs' | 'items_eaten'>
    lunchCarbs = meal.total_offered_carbs

    const { data: sessions } = await supabase
      .from('t1d_dose_sessions')
      .select('actual_dose_grams')
      .eq('meal_event_id', meal.id)
      .order('created_at', { ascending: true })
      .limit(2)

    const all = (sessions ?? []) as Pick<T1dDoseSession, 'actual_dose_grams'>[]
    if (all.length > 1 && all[all.length - 1].actual_dose_grams != null) {
      lunchPhase = 'done'
    } else if (all.length > 0 && all[0].actual_dose_grams != null) {
      lunchPhase = 'dosed'
    } else {
      lunchPhase = 'packed'
    }
  }

  return (
    <div className="px-4 pt-3 pb-3 space-y-2.5">
      <AppHeader />
      <BgCard egvs={egvs} />

      {/* Weekday lunch tile */}
      {isWeekday && (
        <Link href={lunchPhase === 'none' ? '/engine' : '/lunch'}>
          <div className="bg-[#141414] rounded-2xl border border-teal-500/20 px-4 py-3.5 flex items-center gap-3 active:opacity-80">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
              lunchPhase === 'done' ? 'bg-teal-500/20' : 'bg-teal-500/10'
            }`}>
              {lunchPhase === 'done' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 11l19-9-9 19-2-8-8-2z" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold tracking-widest text-teal-400">
                SCHOOL LUNCH ·{' '}
                {lunchPhase === 'none' ? 'NOT PACKED' :
                 lunchPhase === 'packed' ? 'READY TO DOSE' :
                 lunchPhase === 'dosed' ? 'IN PROGRESS' : 'DONE'}
              </p>
              <p className="text-sm font-semibold text-white mt-0.5">
                {lunchPhase === 'none' && 'Pack lunch for today'}
                {lunchPhase === 'packed' && `${lunchCarbs ?? '—'}g packed · tap to dose`}
                {lunchPhase === 'dosed' && 'Dose given · record what he ate'}
                {lunchPhase === 'done' && 'Lunch complete ✓'}
              </p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </Link>
      )}

      <InsightTile />
      <QuickActions />
      {nextEvent && <NextUpCard event={nextEvent} />}
    </div>
  )
}
