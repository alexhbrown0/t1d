import { createServerClient } from '@/lib/supabase/server'
import { DeviceStrip } from '@/components/t1d/device-strip'
import { LogEntries } from '@/components/t1d/log-entries'
import type { T1dDoseSession, T1dLowTreatment } from '@/types/health'
import type { LogEntry, LinkedDose } from '@/components/t1d/log-entries'

export const dynamic = 'force-dynamic'

export default async function LogPage() {
  const supabase = createServerClient()
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [sessionsResult, lowsResult, egvsResult, mealsResult, cgmResult, podResult] = await Promise.all([
    supabase
      .from('t1d_dose_sessions')
      .select('*')
      .gte('timestamp', since7d)
      .order('timestamp', { ascending: false })
      .limit(50),
    supabase
      .from('t1d_low_treatments')
      .select('*')
      .gte('timestamp', since7d)
      .order('timestamp', { ascending: false })
      .limit(30),
    supabase
      .from('dexcom_egvs')
      .select('value_mgdl')
      .gte('system_time', since24h)
      .order('system_time', { ascending: true }),
    supabase
      .from('t1d_meal_events')
      .select('id, timestamp, context, source, items_offered, items_eaten, total_offered_carbs, total_eaten_carbs')
      .gte('timestamp', since7d)
      .order('timestamp', { ascending: false })
      .limit(30),
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
  const meals = mealsResult.data ?? []
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

  const mealLinkedSessionIds = new Set(
    sessions.filter(s => s.meal_event_id != null).map(s => s.id)
  )

  const CONTEXT_LABELS: Record<string, string> = {
    school_lunch: 'School Lunch',
    home_dinner: 'Home Dinner',
    grandparent: 'Grandparent Meal',
    breakfast: 'Breakfast',
    snack: 'Snack',
  }

  const entries: LogEntry[] = [
    ...meals.map(m => {
      const linkedSessions = sessions.filter(s => s.meal_event_id === m.id)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

      const itemsEaten = m.items_eaten as Array<{ name: string; carbs: number; qty_offered: number; qty_eaten: number | null }> | null
      const itemsOffered = m.items_offered as Array<{ name: string; carbs: number; qty_offered: number }> | null

      let mealItems: string[] | undefined
      if (itemsEaten && itemsEaten.length > 0) {
        mealItems = itemsEaten.map(i => {
          const pct = i.qty_offered > 0 ? Math.round(((i.qty_eaten ?? 0) / i.qty_offered) * 100) : 0
          const carbs = Math.round(i.carbs * (i.qty_eaten ?? 0))
          return `${i.name} — ${pct}% · ${carbs}g`
        })
      } else if (itemsOffered && itemsOffered.length > 0) {
        mealItems = itemsOffered.map(i => `${i.name} · ${Math.round(i.carbs * i.qty_offered)}g packed`)
      }

      const linkedDoses: LinkedDose[] = linkedSessions.map((s, idx) => {
        const tag = idx === 0 ? 'Pre-bolus' : 'Follow-up'
        const grams = s.actual_dose_grams ?? s.recommended_dose_grams ?? 0
        const units = s.pump_suggested_units != null ? ` · ${s.pump_suggested_units}u` : ''
        const confirmed = s.actual_dose_grams != null ? '' : ' (unconfirmed)'
        return { text: `${tag}: ${grams}g${units}${confirmed}`, time: s.actual_dose_timestamp }
      })

      const totalCarbs = m.total_eaten_carbs != null
        ? `${Math.round(m.total_eaten_carbs)}g eaten`
        : m.total_offered_carbs != null
          ? `${Math.round(m.total_offered_carbs)}g packed — eaten not logged`
          : ''

      return {
        id: m.id,
        type: 'meal' as const,
        timestamp: m.timestamp,
        label: CONTEXT_LABELS[m.context] ?? m.context,
        sub: totalCarbs,
        color: 'text-teal-400',
        dot: 'bg-teal-500',
        mealItems,
        linkedDoses: linkedDoses.length > 0 ? linkedDoses : undefined,
        sourceTag: m.source === 'chat' ? 'via chat' : undefined,
      }
    }),
    ...sessions.filter(s => !mealLinkedSessionIds.has(s.id)).map(s => {
      const snap = s.context_snapshot as { correction?: boolean; bg?: number } | null
      const isCorrection = snap?.correction === true
      const units = s.pump_suggested_units != null ? `${s.pump_suggested_units}u` : ''
      return {
        id: s.id,
        type: 'bolus' as const,
        timestamp: s.timestamp,
        label: isCorrection
          ? `Correction${snap?.bg ? ` · BG ${Math.round(snap.bg)}` : ''}${units ? ` · ${units}` : ''}`
          : (s.recommended_dose_grams ? `Bolus · ${s.recommended_dose_grams}g` : 'Bolus logged'),
        sub: isCorrection ? '' : (s.engine_confidence ? `Confidence: ${s.engine_confidence}` : s.entered_by ?? ''),
        color: isCorrection ? 'text-yellow-400' : 'text-blue-400',
        dot: isCorrection ? 'bg-yellow-500' : 'bg-blue-500',
      }
    }),
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
        <p className="text-lg font-semibold text-white mt-0.5">Recent Activity</p>
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
