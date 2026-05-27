import { createServerClient } from '@/lib/supabase/server'
import { getLatestEgvs } from '@/lib/dexcom/client'
import type { T1dDoseSession, T1dMealEvent, MealItem } from '@/types/health'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default async function LunchPage() {
  const supabase = createServerClient()
  const since = new Date()
  since.setHours(0, 0, 0, 0)

  const [sessionResult, egvs] = await Promise.all([
    supabase
      .from('t1d_dose_sessions')
      .select('*, t1d_meal_events(*)')
      .gte('timestamp', since.toISOString())
      .order('timestamp', { ascending: false })
      .limit(1),
    getLatestEgvs(1).catch(() => []),
  ])

  const session = sessionResult.data?.[0] as (T1dDoseSession & { t1d_meal_events: T1dMealEvent | null }) | null
  const meal = session?.t1d_meal_events ?? null
  const latestBg = egvs[0]

  const items: MealItem[] = meal?.items_offered ?? []
  const totalCarbs = meal?.total_offered_carbs ?? items.reduce((s, i) => s + i.carbs * i.qty_offered, 0)

  return (
    <div className="px-4 pt-5 pb-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/engine" className="text-gray-500">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div>
          <p className="text-[10px] tracking-widest text-teal-400 font-semibold">LUNCH FLOW</p>
          <p className="text-lg font-semibold text-white">Today&apos;s Lunch</p>
        </div>
      </div>

      {/* BG context */}
      {latestBg && (
        <div className="bg-[#141414] rounded-2xl border border-white/5 px-4 py-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-teal-400 flex-shrink-0" />
          <p className="text-sm text-gray-300">
            Current BG: <span className="font-semibold text-white">{latestBg.value_mgdl} mg/dL</span>
            {latestBg.trend && <span className="text-gray-500"> · {latestBg.trend}</span>}
          </p>
        </div>
      )}

      {!session ? (
        <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-8 text-center space-y-3">
          <p className="text-gray-400 text-sm">No lunch packed yet today</p>
          <p className="text-gray-600 text-xs">Pack lunch to get dosing guidance</p>
          <button className="mt-2 bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold px-5 py-2.5 rounded-xl">
            Pack Lunch
          </button>
        </div>
      ) : (
        <>
          {/* Dosing recommendation */}
          {session.recommended_dose_grams != null && (
            <div className="bg-[#141414] rounded-2xl border border-teal-500/30 p-5 space-y-3">
              <p className="text-[10px] tracking-widest text-teal-400 font-semibold">
                BOLUS WHEN HE STARTS EATING
              </p>
              <div className="flex items-baseline gap-2">
                <p className="text-5xl font-bold text-white">{session.recommended_dose_grams}g</p>
                <p className="text-gray-500 text-sm">into pump</p>
              </div>

              {session.engine_reasoning && (
                <p className="text-xs text-gray-400 leading-relaxed">{session.engine_reasoning}</p>
              )}

              {/* Pump instructions */}
              <div className="bg-black/30 rounded-xl p-3 font-mono text-xs text-teal-300 space-y-1">
                <p>1. Tap Bolus on Omnipod 5</p>
                <p>2. Select Manual</p>
                <p>3. Enter <span className="font-bold text-white">{session.recommended_dose_grams}g carbs</span></p>
                <p>4. Confirm dose</p>
              </div>

              {session.recommended_extended_grams && (
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3">
                  <p className="text-[10px] text-yellow-400 font-semibold mb-1">EXTENDED DOSE</p>
                  <p className="text-xs text-gray-400">
                    High fat/protein meal — enter <span className="text-white font-semibold">{session.recommended_extended_grams}g</span> for
                    extended delivery over {session.recommended_extended_hours}h. Watch for a rise 2–3h after eating.
                  </p>
                </div>
              )}

              <button className="w-full bg-teal-500/10 border border-teal-500/30 text-teal-300 font-semibold py-3.5 rounded-xl text-sm">
                Confirm bolus given
              </button>
            </div>
          )}

          {/* Lunch items */}
          {items.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] tracking-widest text-gray-500 font-semibold">LUNCH ITEMS</p>
              {items.map((item, i) => (
                <div key={i} className="bg-[#141414] rounded-xl border border-white/5 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.name}</p>
                    {item.qty_offered !== 1 && (
                      <p className="text-xs text-gray-500 mt-0.5">× {item.qty_offered}</p>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-teal-400">{item.carbs * item.qty_offered}g</p>
                </div>
              ))}
              <div className="px-4 py-2 flex justify-between">
                <span className="text-xs text-gray-600">Total carbs</span>
                <span className="text-sm font-bold text-white">{totalCarbs}g</span>
              </div>
            </div>
          )}

          <div className="text-center">
            <p className="text-xs text-gray-700">
              Packed at {formatTime(session.timestamp)}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
