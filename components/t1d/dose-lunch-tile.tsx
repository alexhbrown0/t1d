'use client'

import type { T1dDoseSession, T1dEngineParams } from '@/types/health'

interface Props {
  session: (T1dDoseSession & { t1d_meal_events: unknown }) | null
  params: T1dEngineParams | null
}

export function DoseLunchTile({ session, params }: Props) {
  if (!session) {
    return (
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <p className="text-sm text-gray-400 font-medium">Lunch</p>
        <p className="text-gray-600 text-sm mt-1">No lunch plan for today yet</p>
        <p className="text-xs text-gray-700 mt-1">Pack lunch in the Engine tab to generate dosing guidance</p>
      </div>
    )
  }

  const doseNow = session.recommended_dose_grams
  const extended = session.recommended_extended_grams
  const delay = session.dose_delay_minutes
  const waitAndSee = session.wait_and_see
  const confidence = session.engine_confidence
  const reasoning = session.engine_reasoning

  const confidenceBadge = {
    high: 'bg-green-900 text-green-300',
    medium: 'bg-yellow-900 text-yellow-300',
    low: 'bg-red-900 text-red-300',
  }[confidence ?? 'medium'] ?? 'bg-gray-800 text-gray-400'

  return (
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400 font-medium">Lunch Dosing</p>
        {confidence && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceBadge}`}>
            {confidence} confidence
          </span>
        )}
      </div>

      {waitAndSee ? (
        <div className="space-y-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Hold — monitoring BG</p>
          <p className="text-lg font-medium text-yellow-300">Wait and see</p>
          {session.wait_reason && (
            <p className="text-sm text-gray-400">{session.wait_reason}</p>
          )}
        </div>
      ) : doseNow != null && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            {delay && delay > 0 ? `Dose in ~${delay} min` : 'Dose now'}
          </p>
          <p className="text-3xl font-bold text-white">
            {doseNow}g
            <span className="text-base font-normal text-gray-400 ml-2">into pump</span>
          </p>
        </div>
      )}

      {extended != null && (
        <div className="pt-2 border-t border-gray-800 space-y-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Extended dose</p>
          <p className="text-xl font-semibold text-white">
            {extended}g
            <span className="text-sm font-normal text-gray-400 ml-2">
              over {session.recommended_extended_hours ?? '?'} hrs
            </span>
          </p>
        </div>
      )}

      {reasoning && (
        <p className="text-xs text-gray-500 pt-1">{reasoning}</p>
      )}

      {confidence === 'low' && (
        <div className="bg-red-950 border border-red-900 rounded-xl p-3">
          <p className="text-red-300 text-sm font-medium">Low confidence — consider texting Alexandra</p>
        </div>
      )}
    </div>
  )
}
