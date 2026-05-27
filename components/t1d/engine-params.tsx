'use client'

import { useEffect, useState } from 'react'
import type { T1dEngineParams } from '@/types/health'

export function EngineParams() {
  const [params, setParams] = useState<T1dEngineParams | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/t1d/engine-params')
      .then(r => r.json())
      .then(setParams)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-600 text-sm py-4 text-center">Loading...</div>
  if (!params) return (
    <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-6 text-center">
      <p className="text-gray-500 text-sm">No parameters found</p>
      <p className="text-xs text-gray-700 mt-1">Add parameters in Supabase to enable the engine</p>
    </div>
  )

  const rows: { label: string; value: string }[] = [
    { label: 'Pre-bolus %', value: `${Math.round(params.pre_bolus_pct * 100)}%` },
    { label: 'Pre-bolus lead', value: `${params.pre_bolus_lead_min} min` },
    { label: 'Follow-up coverage', value: `${Math.round(params.follow_up_coverage_pct * 100)}%` },
    { label: 'Activity reduction', value: `${Math.round(params.activity_reduction_pct * 100)}%` },
    { label: 'Activity window', value: `${params.activity_window_min} min` },
    { label: 'Low carryover cut', value: `${Math.round((params.low_carryover_reduction_pct ?? 0) * 100)}%` },
    { label: 'ICR', value: params.current_icr ? `1:${params.current_icr}` : '—' },
    { label: 'ISF', value: params.current_isf ? `${params.current_isf}` : '—' },
    { label: 'DIA', value: params.current_dia ? `${params.current_dia}h` : '—' },
    { label: 'Target BG', value: params.target_bg ? `${params.target_bg} mg/dL` : '—' },
    { label: 'Insulin', value: params.insulin_type },
    { label: 'Effective from', value: params.effective_from },
  ]

  return (
    <div className="space-y-3">
      <div className="bg-[#141414] rounded-2xl border border-white/5 p-4">
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold mb-3">CURRENT PARAMETERS</p>
        <div className="divide-y divide-white/5">
          {rows.map(row => (
            <div key={row.label} className="flex justify-between py-2.5">
              <span className="text-xs text-gray-500">{row.label}</span>
              <span className="text-xs font-semibold text-white">{row.value}</span>
            </div>
          ))}
        </div>
        {params.notes && (
          <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-white/5">{params.notes}</p>
        )}
      </div>
      <p className="text-[10px] text-gray-700 text-center">Parameter changes require Alexandra&apos;s approval</p>
    </div>
  )
}
