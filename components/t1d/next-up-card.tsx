import { getCurrentAndNext, minutesUntil, formatBlockTime } from '@/lib/t1d/day-schedule'

export function NextUpCard() {
  const { current, next } = getCurrentAndNext()
  if (!current && !next) return null

  const nextMins = next ? minutesUntil(next.start) : null

  return (
    <div className="bg-[#141414] rounded-2xl border border-white/5 px-4 py-3 flex items-center gap-3">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${current ? 'bg-teal-400' : 'bg-gray-600'}`} />
      <div className="flex-1 min-w-0">
        {current ? (
          <>
            <p className="text-[10px] tracking-widest text-teal-400 font-semibold">
              NOW · UNTIL {formatBlockTime(current.end)}
            </p>
            <p className="text-sm font-semibold text-white mt-0.5 truncate">{current.label}</p>
            {next && (
              <p className="text-xs text-gray-500 mt-0.5">Next: {next.label} in {nextMins}m</p>
            )}
          </>
        ) : (
          <>
            <p className="text-[10px] tracking-widest text-gray-500 font-semibold">NEXT UP · IN {nextMins}M</p>
            <p className="text-sm font-semibold text-white mt-0.5 truncate">{next!.label} · {formatBlockTime(next!.start)}</p>
          </>
        )}
      </div>
    </div>
  )
}
