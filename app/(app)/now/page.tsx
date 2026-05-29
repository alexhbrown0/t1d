import { createServerClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/t1d/app-header'
import { BgCard } from '@/components/t1d/bg-card'
import { DeviceCard } from '@/components/t1d/device-card'
import { LunchTile } from '@/components/t1d/lunch-tile'
import { QuickActions } from '@/components/t1d/quick-actions'
import { NextUpCard } from '@/components/t1d/next-up-card'

export const dynamic = 'force-dynamic'

export default async function NowPage() {
  const supabase = createServerClient()

  const [egvsResult, sessionResult, scheduleResult, cgmResult, podResult] = await Promise.all([
    supabase
      .from('dexcom_egvs')
      .select('*')
      .order('system_time', { ascending: false })
      .limit(36),
    supabase
      .from('t1d_dose_sessions')
      .select('*, t1d_meal_events(*)')
      .gte('timestamp', new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(1),
    supabase
      .from('t1d_school_schedule')
      .select('*')
      .eq('active', true)
      .order('start_time', { ascending: true }),
    supabase
      .from('t1d_device_changes')
      .select('type, changed_at')
      .eq('type', 'cgm')
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('t1d_device_changes')
      .select('type, changed_at')
      .eq('type', 'pod')
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const egvs = egvsResult.data ?? []
  const latestSession = sessionResult.data?.[0] ?? null
  const schedule = scheduleResult.data ?? []
  const cgm = cgmResult.data as { type: 'cgm'; changed_at: string } | null
  const pod = podResult.data as { type: 'pod'; changed_at: string } | null

  const now = new Date()
  const todayDay = now.getDay()
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`
  const nextEvent = schedule.find(
    (s) => s.day_of_week === todayDay && s.start_time > nowTime
  ) ?? null

  return (
    <div className="px-4 pt-5 pb-4 space-y-3">
      <AppHeader />
      <BgCard egvs={egvs} />
      <DeviceCard cgm={cgm} pod={pod} />
      <LunchTile session={latestSession} />
      <QuickActions />
      {nextEvent && <NextUpCard event={nextEvent} />}
    </div>
  )
}
