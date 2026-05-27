interface ScheduleEvent {
  event_type: string
  start_time: string
  end_time: string
  notes: string | null
}

function minutesUntil(timeStr: string): number {
  const now = new Date()
  const [h, m] = timeStr.split(':').map(Number)
  const then = new Date(now)
  then.setHours(h, m, 0, 0)
  return Math.max(0, Math.round((then.getTime() - now.getTime()) / 60000))
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const TYPE_LABEL: Record<string, string> = {
  pe: 'PE', lunch: 'Lunch', recess: 'Recess',
}

export function NextUpCard({ event }: { event: ScheduleEvent }) {
  const mins = minutesUntil(event.start_time)
  return (
    <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-4 flex items-center gap-4">
      <div className="w-2 h-2 rounded-full bg-gray-600" />
      <div className="flex-1">
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold">
          NEXT UP · IN {mins}M
        </p>
        <p className="text-sm font-semibold text-white mt-0.5">
          {TYPE_LABEL[event.event_type] ?? event.event_type} · {formatTime(event.start_time)}
        </p>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  )
}
