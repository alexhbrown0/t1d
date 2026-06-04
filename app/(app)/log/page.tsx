import { createServerClient } from '@/lib/supabase/server'
import { DeviceStrip } from '@/components/t1d/device-strip'
import { LogEntries } from '@/components/t1d/log-entries'
import type { T1dDoseSession, T1dLowTreatment } from '@/types/health'
import type { LogEntry } from '@/components/t1d/log-entries'

export const dynamic = 'force-dynamic'



export default async function LogPage() {
  const supabase = createServerClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [sessionsResult, lowsResult, egvsResult, cgmResult, podResult] = await Promise.all([
    supabase
      .from('t1d_dose_sessions')
      .select('*')
      .gte('timestamp', since)
      .order('timestamp', { ascending: false })
      .limit(20),
    supabase
      .from('t1d_low_treatments')
      .select('*')
      .gte('timestamp', since)
      .order('timestamp', { ascending: false })
      .limit(20),
    supabase
      .from('dexcom_egvs')
      .select('value_mgdl')
      .gte('system_time', since)
      .order('system_time', { ascending: true }),
    supabase
      .from('t1d_device_changes')
      .select('*')
      .eq('type', 'cgm')
      .is('removed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('t1d_device_changes')
      .select('*')
      .eq('type', 'pod')
      .is('removed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const sessions: T1dDoseSession[] = sessionsResult.data ?? []
  const lows: T1dLowTreatment[] = lowsResult.data ?? []
  const egvs = egvsResult.data ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cgm = (cgmResult.data ?? null) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pod = (podResult.data ?? null) as any

  // TIR calculation
  const LOW = 70
  const HIGH = 180
  const readings = egvs.filter(e => e.value_mgdl !== null)
  const totalReadings = readings.length
  const lowCount = readings.filter(e => (e.value_mgdl ?? 0) < LOW).length
  const highCount = readings.filter(e => (e.value_mgdl ?? 0) > HIGH).length
  const inRangeCount = totalReadings - lowCount - highCount

  const lowPct = totalReadings > 0 ? Math.round((lowCount / totalReadings) * 100) : 0
  const highPct = totalReadings > 0 ? Math.round((highCount / totalReadings) * 100) : 0
  const inRangePct = totalReadings > 0 ? Math.round((inRangeCount / totalReadings) * 100) : 0

  // Build unified log entries
  const entries: LogEntry[] = [
    ...sessions.map(s => ({
      id: s.id,
      type: 'bolus' as const,
      timestamp: s.timestamp,
      label: s.recommended_dose_grams
        ? `Bolus · ${s.recommended_dose_grams}g`
        : 'Bolus logged',
      sub: s.engine_confidence ? `Confidence: ${s.engine_confidence}` : s.entered_by ?? '',
      color: 'text-blue-400',
      dot: 'bg-blue-500',
    })),
    ...lows.map(l => ({
      id: l.id,
      type: 'low' as const,
      timestamp: l.timestamp,
      label: `Low treated · ${l.bg_at_treatment ?? '?'} mg/dL`,
      sub: l.treatment_type ? `${l.treatment_carbs_g ?? '?'}g ${l.treatment_type}` : '',
      color: 'text-red-400',
      dot: 'bg-red-500',
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return (
    <div className="px-4 pt-5 pb-4 space-y-4">
      {/* Header */}
      <div>
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold">LOG</p>
        <p className="text-lg font-semibold text-white mt-0.5">Last 24 Hours</p>
      </div>

      {/* Device status strip */}
      <DeviceStrip initialCgm={cgm} initialPod={pod} />

      {/* TIR bar */}
      <div className="bg-[#141414] rounded-2xl border border-white/5 p-4">
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold mb-3">TIME IN RANGE</p>
        {totalReadings === 0 ? (
          <p className="text-gray-600 text-sm text-center py-2">No CGM data yet</p>
        ) : (
          <>
            <div className="flex rounded-full overflow-hidden h-3 gap-0.5">
              {lowPct > 0 && (
                <div className="bg-red-500 rounded-full" style={{ width: `${lowPct}%` }} />
              )}
              {inRangePct > 0 && (
                <div className="bg-teal-500 rounded-full" style={{ width: `${inRangePct}%` }} />
              )}
              {highPct > 0 && (
                <div className="bg-yellow-500 rounded-full" style={{ width: `${highPct}%` }} />
              )}
            </div>
            <div className="flex justify-between mt-2 text-[10px]">
              <span className="text-red-400">Low {lowPct}%</span>
              <span className="text-teal-400 font-semibold">In range {inRangePct}%</span>
              <span className="text-yellow-400">High {highPct}%</span>
            </div>
          </>
        )}
      </div>

      {/* Event log */}
      <LogEntries initialEntries={entries} />
    </div>
  )
}
