'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { T1dEngineParams, T1dDoseSession } from '@/types/health'

export function EngineToday() {
  const [params, setParams] = useState<T1dEngineParams | null>(null)
  const [latestSession, setLatestSession] = useState<T1dDoseSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/t1d/engine-params').then(r => r.json()),
      fetch('/api/t1d/dose-session?limit=1').then(r => r.json()).catch(() => null),
    ]).then(([paramsData, sessionData]) => {
      setParams(paramsData)
      setLatestSession(Array.isArray(sessionData) ? sessionData[0] : null)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-600 text-sm py-4 text-center">Loading...</div>

  if (!params) {
    return (
      <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-6 text-center space-y-3">
        <p className="text-gray-400 text-sm">No engine parameters set</p>
        <p className="text-gray-600 text-xs">Add parameters to start getting dosing guidance</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Active strategy */}
      <div className="bg-[#141414] rounded-2xl border border-teal-500/20 p-4">
        <p className="text-[10px] tracking-widest text-teal-400 font-semibold mb-3">ACTIVE STRATEGY</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-gray-600">Pre-bolus</p>
            <p className="text-sm font-semibold text-white">{Math.round(params.pre_bolus_pct * 100)}% · {params.pre_bolus_lead_min}m before</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-600">Follow-up</p>
            <p className="text-sm font-semibold text-white">{Math.round(params.follow_up_coverage_pct * 100)}% coverage</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-600">Activity cut</p>
            <p className="text-sm font-semibold text-white">{Math.round(params.activity_reduction_pct * 100)}% if PE within {params.activity_window_min}m</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-600">Low carryover</p>
            <p className="text-sm font-semibold text-white">{Math.round((params.low_carryover_reduction_pct ?? 0) * 100)}% reduction</p>
          </div>
        </div>
      </div>

      {/* Pump settings */}
      <div className="bg-[#141414] rounded-2xl border border-white/5 p-4">
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold mb-3">OMNIPOD 5 SETTINGS</p>
        <div className="flex gap-4">
          <div>
            <p className="text-[10px] text-gray-600">ICR</p>
            <p className="text-sm font-semibold text-white">1:{params.current_icr ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-600">ISF</p>
            <p className="text-sm font-semibold text-white">{params.current_isf ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-600">Target</p>
            <p className="text-sm font-semibold text-white">{params.target_bg ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-600">Insulin</p>
            <p className="text-sm font-semibold text-white capitalize">{params.insulin_type}</p>
          </div>
        </div>
      </div>

      {/* Latest session */}
      {latestSession && (
        <div className="bg-[#141414] rounded-2xl border border-white/5 p-4">
          <p className="text-[10px] tracking-widest text-gray-500 font-semibold mb-2">LAST DOSE SESSION</p>
          <p className="text-sm text-white">
            {latestSession.recommended_dose_grams}g recommended
            {latestSession.actual_dose_grams != null && ` · ${latestSession.actual_dose_grams}g given`}
          </p>
          {latestSession.engine_reasoning && (
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{latestSession.engine_reasoning}</p>
          )}
        </div>
      )}

      <Link href="/engine/lunch">
        <div className="bg-teal-500/10 border border-teal-500/20 rounded-2xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-300">Pack today&apos;s lunch</p>
            <p className="text-xs text-teal-600 mt-0.5">Get dosing ready before school</p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </Link>
    </div>
  )
}
