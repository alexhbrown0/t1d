import type { T1dDoseSession } from '@/types/health'
import Link from 'next/link'

interface Props {
  session: (T1dDoseSession & { t1d_meal_events: unknown }) | null
}

export function LunchTile({ session }: Props) {
  const meal = session?.t1d_meal_events as Record<string, unknown> | null ?? null
  const totalCarbs = meal ? (meal.total_offered_carbs as number | null) : null

  return (
    <Link href="/engine/lunch">
      <div className="bg-[#141414] rounded-2xl border border-teal-500/20 px-5 py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l19-9-9 19-2-8-8-2z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-semibold tracking-widest text-teal-400">TODAY&apos;S LUNCH</span>
            <span className="text-[10px] text-gray-600">·</span>
            <span className="text-[10px] font-semibold tracking-widest text-teal-400">
              {session ? 'OPEN' : 'NOT SET'}
            </span>
          </div>
          {session && totalCarbs != null ? (
            <>
              <p className="text-sm font-semibold text-white">Lunch packed · {totalCarbs}g</p>
              <p className="text-xs text-gray-500 mt-0.5">Tap to review dosing guidance</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-white">No lunch packed yet</p>
              <p className="text-xs text-gray-500 mt-0.5">Tap to pack lunch in the Engine tab</p>
            </>
          )}
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </Link>
  )
}
