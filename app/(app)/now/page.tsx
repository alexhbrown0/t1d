import { createServerClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/t1d/app-header'
import { BgCard } from '@/components/t1d/bg-card'
import { InsightTile } from '@/components/t1d/insight-tile'
import { QuickActions } from '@/components/t1d/quick-actions'
import { NextUpCard } from '@/components/t1d/next-up-card'

export const dynamic = 'force-dynamic'

export default async function NowPage() {
  const supabase = createServerClient()

  const [egvsResult, scheduleResult] = await Promise.all([
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
  ])

  const egvs = egvsResult.data ?? []
  const schedule = scheduleResult.data ?? []

  const now = new Date()
  const todayDay = now.getDay()
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`
  const nextEvent = schedule.find(
    (s) => s.day_of_week === todayDay && s.start_time > nowTime
  ) ?? null

  return (
    <div className="px-4 pt-3 pb-3 space-y-2.5">
      <AppHeader />
      <BgCard egvs={egvs} />
      <InsightTile />
      <QuickActions />
      {nextEvent && <NextUpCard event={nextEvent} />}
    </div>
  )
}
