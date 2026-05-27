import { createServerClient } from '@/lib/supabase/server'
import { BgDisplay } from '@/components/t1d/bg-display'
import { DoseLunchTile } from '@/components/t1d/dose-lunch-tile'
import { QuickActions } from '@/components/t1d/quick-actions'

export const dynamic = 'force-dynamic'

export default async function NowPage() {
  const supabase = createServerClient()

  const [egvsResult, sessionResult, paramsResult] = await Promise.all([
    supabase
      .from('dexcom_egvs')
      .select('*')
      .order('system_time', { ascending: false })
      .limit(5),
    supabase
      .from('t1d_dose_sessions')
      .select('*, t1d_meal_events(*)')
      .gte('timestamp', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(1),
    supabase
      .from('t1d_engine_params')
      .select('*')
      .order('effective_from', { ascending: false })
      .limit(1),
  ])

  const egvs = egvsResult.data ?? []
  const latestSession = sessionResult.data?.[0] ?? null
  const params = paramsResult.data?.[0] ?? null
  const latest = egvs[0] ?? null

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-200">Brooks</h1>
          <span className="text-xs text-gray-500">
            {latest
              ? new Date(latest.display_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '—'}
          </span>
        </header>

        <BgDisplay egvs={egvs} />
        <DoseLunchTile session={latestSession} params={params} />
        <QuickActions />
      </div>
    </div>
  )
}
