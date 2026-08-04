import { getCentralTime } from '@/lib/utils/central-time'

interface ScheduleEvent {
  event_type: string
  start_time: string
  end_time: string
  notes: string | null
}

function minutesUntil(timeStr: string): number {
  const { minutesSinceMidnight } = getCentralTime()
  const [h, m] = timeStr.split(':').map(Number)
  return Math.max(0, h * 60 + m - minutesSinceMidnight)
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  return new Date(0, 0, 0, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const TYPE_LABEL: Record<string, string> = {
  pe: 'PE', lunch: 'Lunch', recess: 'Recess', snack: 'Snack',
  playground: 'Playground', swimming: 'Swimming',
  breakfast: 'Breakfast', bedtime: 'Bedtime',
}
const label = (t: string) => TYPE_LABEL[t] ?? t

export function NextUpCard({ current, next }: { current: ScheduleEvent | null; next: ScheduleEvent | null }) {
  if (!current && !next) return null

  const nextMins = next ? minutesUntil(next.start_time) : null

  return (
    <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-4 flex items-center gap-4">
      <div className={`w-2 h-2 rounded-full ${current ? 'bg-teal-400' : 'bg-gray-600'}`} />
      <div className="flex-1 min-w-0">
        {current ? (
          <>
            <p className="text-[10px] tracking-widest text-teal-400 font-semibold">
              NOW · UNTIL {formatTime(current.end_time)}
            </p>
            <p className="text-sm font-semibold text-white mt-0.5">
              {label(current.event_type)}
            </p>
            {next && (
              <p className="text-xs text-gray-500 mt-1">
                Next: {label(next.event_type)} in {nextMins}m
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-[10px] tracking-widest text-gray-500 font-semibold">
              NEXT UP · IN {nextMins}M
            </p>
            <p className="text-sm font-semibold text-white mt-0.5">
              {label(next!.event_type)} · {formatTime(next!.start_time)}
            </p>
          </>
        )}
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  )
}
