import { createServerClient } from '@/lib/supabase/server'
import { getCentralTime, getCentralDateStr } from '@/lib/utils/central-time'
import { ScheduleOverride } from '@/components/t1d/schedule-override'
import { blocksForDay, type DayBlock } from '@/lib/t1d/day-schedule'
import type { T1dDailyOverride } from '@/types/health'

export const dynamic = 'force-dynamic'

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return new Date(0, 0, 0, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function minutesSinceMidnight(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const DAY_START = 6 * 60    // 6 AM
const DAY_END   = 21 * 60   // 9 PM
const DAY_TOTAL = DAY_END - DAY_START

const EVENT_COLORS: Record<string, string> = {
  pe:         'bg-green-500',
  recess:     'bg-yellow-500',
  playground: 'bg-lime-500',
  swimming:   'bg-sky-400',
  lunch:      'bg-teal-500',
  snack:      'bg-orange-400',
  breakfast:  'bg-purple-400',
  bedtime:    'bg-indigo-400',
}

const EVENT_LABELS: Record<string, string> = {
  pe:         'PE',
  recess:     'Recess',
  playground: 'Playground',
  swimming:   'Swimming',
  lunch:      'Lunch',
  snack:      'Snack',
  breakfast:  'Breakfast',
  bedtime:    'Bedtime',
}

const EVENT_BORDER: Record<string, string> = {
  pe:         'border-green-500/30 bg-green-500/5',
  recess:     'border-yellow-500/30 bg-yellow-500/5',
  playground: 'border-lime-500/30 bg-lime-500/5',
  swimming:   'border-sky-400/30 bg-sky-400/5',
  lunch:      'border-teal-500/30 bg-teal-500/5',
  snack:      'border-orange-400/30 bg-orange-400/5',
  breakfast:  'border-purple-400/30 bg-purple-400/5',
  bedtime:    'border-indigo-400/30 bg-indigo-400/5',
}

const EVENT_TEXT: Record<string, string> = {
  pe:         'text-green-400',
  recess:     'text-yellow-400',
  playground: 'text-lime-400',
  swimming:   'text-sky-400',
  lunch:      'text-teal-400',
  snack:      'text-orange-400',
  breakfast:  'text-purple-400',
  bedtime:    'text-indigo-400',
}

export default async function SchedulePage() {
  const supabase = createServerClient()
  const ct = getCentralTime()
  const todayDay = ct.dayOfWeek
  const nowMinutes = ct.minutesSinceMidnight

  const todayDate = getCentralDateStr()

  const { data: overrideData } = await supabase
    .from('t1d_daily_overrides').select('*').eq('override_date', todayDate).limit(1).maybeSingle()

  const schedule: DayBlock[] = blocksForDay(todayDay)
  const override = (overrideData ?? null) as T1dDailyOverride | null

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const isWeekend = todayDay === 0 || todayDay === 6

  const peEvents = schedule.filter(e => e.event_type === 'pe')
  const peMinutes = peEvents.reduce((acc, e) => acc + (minutesSinceMidnight(e.end) - minutesSinceMidnight(e.start)), 0)

  const lunchEvent = schedule.find(e => e.event_type === 'lunch')
  const snackEvents = schedule.filter(e => e.event_type === 'snack')
  const recessEvents = schedule.filter(e => e.event_type === 'recess')
  const recessMinutes = recessEvents.reduce((acc, e) => acc + (minutesSinceMidnight(e.end) - minutesSinceMidnight(e.start)), 0)

  return (
    <div className="px-4 pt-5 pb-4 space-y-4">
      {/* Header */}
      <div>
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold">SCHEDULE</p>
        <p className="text-lg font-semibold text-white mt-0.5">{dayNames[todayDay]}</p>
      </div>

      {isWeekend ? (
        <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-8 text-center">
          <p className="text-gray-500 text-sm">No school today</p>
          <p className="text-gray-700 text-xs mt-1">Weekend schedule</p>
        </div>
      ) : (
        <>
          {/* Day bar */}
          <div className="bg-[#141414] rounded-2xl border border-white/5 p-4">
            <p className="text-[10px] tracking-widest text-gray-500 font-semibold mb-3">DAY OVERVIEW</p>
            <div className="relative h-6 bg-white/5 rounded-full overflow-hidden">
              {/* Current time indicator */}
              {nowMinutes >= DAY_START && nowMinutes <= DAY_END && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white/60 z-10"
                  style={{ left: `${((nowMinutes - DAY_START) / DAY_TOTAL) * 100}%` }}
                />
              )}
              {schedule.map((event, i) => {
                const start = minutesSinceMidnight(event.start)
                const end = minutesSinceMidnight(event.end)
                const left = ((start - DAY_START) / DAY_TOTAL) * 100
                const width = ((end - start) / DAY_TOTAL) * 100
                return (
                  <div
                    key={i}
                    className={`absolute top-0 bottom-0 ${event.event_type ? EVENT_COLORS[event.event_type] : 'bg-gray-600'} opacity-70`}
                    style={{ left: `${Math.max(0, left)}%`, width: `${width}%` }}
                  />
                )
              })}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-gray-700">6 AM</span>
              <span className="text-[10px] text-gray-700">9 PM</span>
            </div>
          </div>

          {/* Stat chips */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-[#141414] rounded-xl border border-green-500/20 px-3 py-3 text-center">
              <p className="text-xs font-semibold text-green-400">{peMinutes}m</p>
              <p className="text-[10px] text-gray-600 mt-0.5">Active</p>
            </div>
            <div className="bg-[#141414] rounded-xl border border-yellow-500/20 px-3 py-3 text-center">
              <p className="text-xs font-semibold text-yellow-400">{recessMinutes}m</p>
              <p className="text-[10px] text-gray-600 mt-0.5">Recess</p>
            </div>
            <div className="bg-[#141414] rounded-xl border border-white/10 px-3 py-3 text-center">
              <p className="text-xs font-semibold text-gray-400">
                {lunchEvent ? formatTime(lunchEvent.start) : '—'}
              </p>
              <p className="text-[10px] text-gray-600 mt-0.5">Lunch</p>
            </div>
            <div className="bg-[#141414] rounded-xl border border-orange-400/20 px-3 py-3 text-center">
              <p className="text-xs font-semibold text-orange-400">
                {snackEvents.length > 0 ? formatTime(snackEvents[0].start) : '—'}
              </p>
              <p className="text-[10px] text-gray-600 mt-0.5">Snack</p>
            </div>
          </div>

          {/* Day override */}
          <ScheduleOverride date={todayDate} initial={override} />

          {/* Timeline */}
          <div className="space-y-2">
            <p className="text-[10px] tracking-widest text-gray-500 font-semibold">TIMELINE</p>
            {schedule.length === 0 && (
              <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-6 text-center">
                <p className="text-gray-600 text-sm">No events scheduled</p>
              </div>
            )}
            {schedule.map((event, i) => {
              const startMin = minutesSinceMidnight(event.start)
              const endMin = minutesSinceMidnight(event.end)
              const isNow = nowMinutes >= startMin && nowMinutes < endMin
              const isPast = nowMinutes >= endMin
              const et = event.event_type

              return (
                <div
                  key={i}
                  className={`rounded-2xl border px-4 py-3 flex items-center gap-3 ${
                    isNow ? (et ? EVENT_BORDER[et] : 'border-white/10 bg-white/5') : 'border-white/5 bg-[#141414]'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isPast ? 'bg-gray-700' : (et ? EVENT_COLORS[et] : 'bg-gray-500')
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-semibold ${isPast ? 'text-gray-600' : 'text-white'}`}>
                        {event.label}
                      </p>
                      {isNow && (
                        <span className={`text-[10px] font-semibold tracking-widest px-1.5 py-0.5 rounded ${
                          et ? EVENT_TEXT[et] : 'text-white'
                        } bg-white/5`}>
                          NOW
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatTime(event.start)} – {formatTime(event.end)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
