import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { getLunchTargetDate } from '@/lib/t1d/lunch-date'
import { AppHeader } from '@/components/t1d/app-header'
import { AutoRefresh } from '@/components/t1d/auto-refresh'
import { BgCard } from '@/components/t1d/bg-card'
import { QuickActions } from '@/components/t1d/quick-actions'
import { NextUpCard } from '@/components/t1d/next-up-card'
import type { T1dMealEvent, T1dDoseSession } from '@/types/health'

export const dynamic = 'force-dynamic'

export default async function NowPage() {
  const supabase = createServerClient()

  const { packingForTomorrow, targetDate, targetEnd } = getLunchTargetDate()

  const { getCentralDayStartUTC } = await import('@/lib/utils/central-time')
  const snackDayStart = getCentralDayStartUTC()

  const [egvsResult, lunchResult, snackResult] = await Promise.all([
    supabase
      .from('dexcom_egvs')
      .select('*')
      .order('system_time', { ascending: false })
      .limit(36),
    supabase
      .from('t1d_meal_events')
      .select('id, total_offered_carbs, total_eaten_carbs, items_eaten')
      .eq('context', 'school_lunch')
      .gte('timestamp', targetDate.toISOString())
      .lt('timestamp', targetEnd.toISOString())
      .order('timestamp', { ascending: false })
      .limit(1),
    supabase
      .from('t1d_meal_events')
      .select('id, total_offered_carbs, items_offered')
      .eq('context', 'snack')
      .gte('timestamp', snackDayStart.toISOString())
      .order('timestamp', { ascending: false })
      .limit(1),
  ])

  const egvs = egvsResult.data ?? []

  const COVERAGE_TOLERANCE_G = 5

  // Determine lunch tile status for weekdays
  let lunchPhase: 'none' | 'packed' | 'dosed' | 'needs_followup' | 'done' = 'none'
  let lunchCarbs: number | null = null
  let lunchUncovered: number | null = null

  if (lunchResult.data && lunchResult.data.length > 0) {
    const meal = lunchResult.data[0] as Pick<T1dMealEvent, 'id' | 'total_offered_carbs' | 'total_eaten_carbs' | 'items_eaten'>
    lunchCarbs = meal.total_offered_carbs

    const { data: sessions } = await supabase
      .from('t1d_dose_sessions')
      .select('actual_dose_grams')
      .eq('meal_event_id', meal.id)
      .order('created_at', { ascending: true })

    const all = (sessions ?? []) as Pick<T1dDoseSession, 'actual_dose_grams'>[]
    const firstConfirmed = all.length > 0 && all[0].actual_dose_grams != null
    const lastConfirmed = all.length > 0 && all[all.length - 1].actual_dose_grams != null
    const eatingRecorded = meal.items_eaten != null

    if (lastConfirmed && eatingRecorded) {
      const totalDosed = all.reduce((s, d) => s + (Number(d.actual_dose_grams) || 0), 0)
      const totalEaten = meal.total_eaten_carbs ?? 0
      const uncovered = Math.max(0, totalEaten - totalDosed)
      if (totalEaten > 0 && uncovered > COVERAGE_TOLERANCE_G) {
        lunchPhase = 'needs_followup'
        lunchUncovered = Math.round(uncovered)
      } else {
        lunchPhase = 'done'
      }
    } else if (firstConfirmed && eatingRecorded) {
      lunchPhase = 'needs_followup'
      const totalDosed = all.reduce((s, d) => s + (Number(d.actual_dose_grams) || 0), 0)
      lunchUncovered = Math.max(0, Math.round((meal.total_eaten_carbs ?? 0) - totalDosed))
    } else if (firstConfirmed) {
      lunchPhase = 'dosed'
    } else {
      lunchPhase = 'packed'
    }
  }

  // Snack status: 'none' | 'dosed'
  let snackPhase: 'none' | 'dosed' = 'none'
  let snackCarbs: number | null = null
  const snackMeal = snackResult.data?.[0] ?? null
  if (snackMeal) {
    snackCarbs = snackMeal.total_offered_carbs
    const { data: snackSessions } = await supabase
      .from('t1d_dose_sessions')
      .select('actual_dose_grams')
      .eq('meal_event_id', snackMeal.id)
      .not('actual_dose_grams', 'is', null)
      .limit(1)
    if (snackSessions && snackSessions.length > 0) snackPhase = 'dosed'
  }

  return (
    <div className="px-4 pt-2 pb-3 flex flex-col gap-3">
      <AutoRefresh intervalMs={60_000} />
      <AppHeader />
      <BgCard egvs={egvs} />

      {/* Lunch tile */}
      {(
        <Link href={lunchPhase === 'none' ? '/engine/lunch' : '/lunch'}>
          <div className="bg-[#141414] rounded-2xl border border-teal-500/20 px-4 py-3.5 flex items-center gap-3 active:opacity-80">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
              lunchPhase === 'done' ? 'bg-teal-500/20' :
              lunchPhase === 'needs_followup' ? 'bg-amber-500/20' : 'bg-teal-500/10'
            }`}>
              {lunchPhase === 'done' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : lunchPhase === 'needs_followup' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 11l19-9-9 19-2-8-8-2z" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[10px] font-semibold tracking-widest ${lunchPhase === 'needs_followup' ? 'text-amber-400' : 'text-teal-400'}`}>
                {packingForTomorrow ? "TOMORROW'S LUNCH" : 'SCHOOL LUNCH'} ·{' '}
                {lunchPhase === 'none' ? 'NOT PACKED' :
                 lunchPhase === 'packed' ? 'READY TO DOSE' :
                 lunchPhase === 'dosed' ? 'IN PROGRESS' :
                 lunchPhase === 'needs_followup' ? 'NEEDS FOLLOW-UP' : 'DONE'}
              </p>
              <p className="text-sm font-semibold text-white mt-0.5">
                {lunchPhase === 'none' && `Pack lunch for ${packingForTomorrow ? 'tomorrow' : 'today'}`}
                {lunchPhase === 'packed' && `${lunchCarbs ?? '—'}g packed${packingForTomorrow ? ' for tomorrow' : ''} · tap to dose`}
                {lunchPhase === 'dosed' && 'Dose given · record what he ate'}
                {lunchPhase === 'needs_followup' && `${lunchUncovered}g still uncovered · tap to check`}
                {lunchPhase === 'done' && 'Lunch complete ✓'}
              </p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </Link>
      )}

      {/* Snack tile */}
      <Link href="/snack">
        <div className="bg-[#141414] rounded-2xl border border-teal-500/20 px-4 py-3.5 flex items-center gap-3 active:opacity-80">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${snackPhase === 'dosed' ? 'bg-teal-500/20' : 'bg-teal-500/10'}`}>
            {snackPhase === 'dosed' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold tracking-widest text-teal-400">
              MORNING SNACK · {snackPhase === 'dosed' ? 'DOSED' : 'NOT DOSED'}
            </p>
            <p className="text-sm font-semibold text-white mt-0.5">
              {snackPhase === 'dosed' ? `${snackCarbs ?? '—'}g dosed ✓` : 'Tap to pick & dose snack'}
            </p>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </Link>

      <QuickActions />
      <NextUpCard />
    </div>
  )
}
