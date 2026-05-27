'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const TREATMENT_TYPES = ['juice', 'glucose_tabs', 'candy', 'other'] as const
type TreatmentType = typeof TREATMENT_TYPES[number]

const TREATMENT_LABELS: Record<TreatmentType, string> = {
  juice: 'Juice Box',
  glucose_tabs: 'Glucose Tabs',
  candy: 'Candy',
  other: 'Other',
}

const JUICE_AMOUNTS = [5, 10, 15, 20] as const

export default function LogLowPage() {
  const router = useRouter()
  const [bg, setBg] = useState('')
  const [treatmentType, setTreatmentType] = useState<TreatmentType>('juice')
  const [carbs, setCarbs] = useState(15)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/t1d/bg-latest')
      .then(r => r.json())
      .then(data => { if (data?.value_mgdl) setBg(String(Math.round(data.value_mgdl))) })
      .catch(() => null)
  }, [])

  const handleJuiceLevel = (level: number) => {
    const amounts = { 1: 5, 2: 10, 3: 15, 4: 20 }
    setCarbs(amounts[level as keyof typeof amounts] ?? 15)
  }

  const submit = async () => {
    if (!bg) return
    setSubmitting(true)
    await fetch('/api/t1d/low-treatments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bg_at_treatment: parseFloat(bg),
        treatment_type: treatmentType,
        treatment_carbs_g: carbs,
        notes: notes || null,
        source: 'manual',
      }),
    })
    router.push('/now')
  }

  return (
    <div className="px-4 pt-5 pb-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <p className="text-[10px] tracking-widest text-red-400 font-semibold">LOG A LOW</p>
          <p className="text-lg font-semibold text-white">Low Treatment</p>
        </div>
      </div>

      {/* BG input */}
      <div className="bg-[#141414] rounded-2xl border border-white/5 p-4">
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold mb-3">BLOOD GLUCOSE</p>
        <div className="flex items-baseline gap-2">
          <input
            type="number"
            value={bg}
            onChange={e => setBg(e.target.value)}
            placeholder="67"
            className="text-4xl font-bold text-white bg-transparent outline-none w-24"
          />
          <span className="text-gray-500 text-sm">mg/dL</span>
        </div>
        <p className="text-xs text-gray-600 mt-1">Pre-filled from CGM · tap to edit</p>
      </div>

      {/* Treatment type */}
      <div>
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold mb-2">TREATMENT TYPE</p>
        <div className="grid grid-cols-2 gap-2">
          {TREATMENT_TYPES.map(type => (
            <button
              key={type}
              onClick={() => setTreatmentType(type)}
              className={`py-3 rounded-xl border text-sm font-semibold transition-colors ${
                treatmentType === type
                  ? 'border-red-500/40 bg-red-500/10 text-red-300'
                  : 'border-white/10 bg-[#141414] text-gray-400'
              }`}
            >
              {TREATMENT_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Juice level picker */}
      {treatmentType === 'juice' && (
        <div>
          <p className="text-[10px] tracking-widest text-gray-500 font-semibold mb-2">JUICE BOX LEVEL</p>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map(level => {
              const labels = { 1: 'Quarter', 2: 'Half', 3: 'Three-Quarter', 4: 'Full' }
              const carbsByLevel = { 1: 5, 2: 10, 3: 15, 4: 20 }
              const isSelected = carbs === carbsByLevel[level as keyof typeof carbsByLevel]
              return (
                <button
                  key={level}
                  onClick={() => handleJuiceLevel(level)}
                  className={`rounded-xl border py-3 flex flex-col items-center gap-1 transition-colors ${
                    isSelected
                      ? 'border-red-500/40 bg-red-500/10'
                      : 'border-white/10 bg-[#141414]'
                  }`}
                >
                  <div className="flex flex-col-reverse gap-0.5">
                    {[4, 3, 2, 1].map(bar => (
                      <div
                        key={bar}
                        className={`w-5 h-1.5 rounded-sm ${
                          bar <= level
                            ? 'bg-red-400'
                            : 'bg-white/10'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-gray-500">{carbsByLevel[level as keyof typeof carbsByLevel]}g</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Manual carbs (non-juice) */}
      {treatmentType !== 'juice' && (
        <div className="bg-[#141414] rounded-2xl border border-white/5 p-4">
          <p className="text-[10px] tracking-widest text-gray-500 font-semibold mb-3">CARBS GIVEN</p>
          <div className="flex items-baseline gap-2">
            <input
              type="number"
              value={carbs}
              onChange={e => setCarbs(Number(e.target.value))}
              className="text-3xl font-bold text-white bg-transparent outline-none w-16"
            />
            <span className="text-gray-500">grams</span>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl px-5 py-4">
        <p className="text-[10px] tracking-widest text-red-400 font-semibold">GIVING</p>
        <p className="text-2xl font-bold text-white mt-1">{carbs}g fast carbs</p>
        <p className="text-xs text-gray-500 mt-0.5">{TREATMENT_LABELS[treatmentType]}</p>
      </div>

      {/* Log button */}
      <button
        onClick={submit}
        disabled={!bg || submitting}
        className="w-full bg-red-500/20 border border-red-500/30 text-red-300 font-semibold py-4 rounded-2xl text-sm disabled:opacity-40"
      >
        {submitting ? 'Logging...' : `Log ${carbs}g`}
      </button>
    </div>
  )
}
