'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const JUICE_CARBS = 15
const GUMMY_CARBS = 5

type TreatmentType = 'juice' | 'gummies' | 'other'

export default function LogLowPage() {
  const router = useRouter()
  const [bg, setBg] = useState('')
  const [type, setType] = useState<TreatmentType>('juice')
  const [juiceAmt, setJuiceAmt] = useState<'half' | 'full'>('full')
  const [gummyCount, setGummyCount] = useState(1)
  const [otherLabel, setOtherLabel] = useState('')
  const [otherCarbs, setOtherCarbs] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/t1d/bg-latest')
      .then(r => r.json())
      .then(d => { if (d?.value_mgdl) setBg(String(Math.round(d.value_mgdl))) })
      .catch(() => null)
  }, [])

  const totalCarbs =
    type === 'juice' ? (juiceAmt === 'half' ? Math.round(JUICE_CARBS / 2) : JUICE_CARBS) :
    type === 'gummies' ? gummyCount * GUMMY_CARBS :
    parseInt(otherCarbs) || 0

  const treatmentLabel =
    type === 'juice' ? `${juiceAmt === 'half' ? 'Half' : 'Full'} juice box` :
    type === 'gummies' ? `${gummyCount} gumm${gummyCount === 1 ? 'y' : 'ies'}` :
    otherLabel || 'Other'

  const submit = async () => {
    if (totalCarbs === 0) { setError('Enter a carb amount first'); return }
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/t1d/low-treatments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bg_at_treatment: bg ? parseFloat(bg) : null,
          treatment_type: type,
          treatment_carbs_g: totalCarbs,
          notes: notes || null,
          source: 'manual',
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Failed to log — try again')
        return
      }
      router.push('/now')
    } catch {
      setError('Network error — try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="px-4 pt-5 pb-4 space-y-5">
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

      {/* BG */}
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

      {/* Treatment type tabs */}
      <div className="flex w-full gap-1 bg-white/5 rounded-xl p-1">
        {(['juice', 'gummies', 'other'] as TreatmentType[]).map(t => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 text-[11px] font-semibold py-2 rounded-lg capitalize transition-colors ${
              type === t ? 'bg-white/10 text-white' : 'text-gray-500'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Juice */}
      {type === 'juice' && (
        <div className="bg-[#141414] rounded-2xl border border-white/5 p-4 space-y-3">
          <p className="text-[10px] tracking-widest text-gray-500 font-semibold">AMOUNT</p>
          <div className="flex gap-3">
            <button
              onClick={() => setJuiceAmt('half')}
              className={`flex-1 py-4 rounded-xl border text-sm font-semibold transition-colors ${
                juiceAmt === 'half' ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-white/10 text-gray-400'
              }`}
            >
              Half<br /><span className="text-xs font-normal">{Math.round(JUICE_CARBS / 2)}g</span>
            </button>
            <button
              onClick={() => setJuiceAmt('full')}
              className={`flex-1 py-4 rounded-xl border text-sm font-semibold transition-colors ${
                juiceAmt === 'full' ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-white/10 text-gray-400'
              }`}
            >
              Full<br /><span className="text-xs font-normal">{JUICE_CARBS}g</span>
            </button>
          </div>
        </div>
      )}

      {/* Gummies */}
      {type === 'gummies' && (
        <div className="bg-[#141414] rounded-2xl border border-white/5 p-4 space-y-3">
          <p className="text-[10px] tracking-widest text-gray-500 font-semibold">HOW MANY? · {GUMMY_CARBS}g EACH</p>
          <div className="flex items-center justify-center gap-6">
            <button onClick={() => setGummyCount(c => Math.max(1, c - 1))} className="w-10 h-10 rounded-xl bg-white/5 text-white text-xl font-bold flex items-center justify-center">−</button>
            <div className="text-center">
              <p className="text-5xl font-bold text-white tabular-nums">{gummyCount}</p>
              <p className="text-xs text-gray-500 mt-1">{gummyCount * GUMMY_CARBS}g carbs</p>
            </div>
            <button onClick={() => setGummyCount(c => c + 1)} className="w-10 h-10 rounded-xl bg-white/5 text-white text-xl font-bold flex items-center justify-center">+</button>
          </div>
        </div>
      )}

      {/* Other */}
      {type === 'other' && (
        <div className="bg-[#141414] rounded-2xl border border-white/5 p-4 space-y-3">
          <p className="text-[10px] tracking-widest text-gray-500 font-semibold">WHAT WAS GIVEN</p>
          <input
            type="text"
            placeholder="e.g. fruit snacks, soda"
            value={otherLabel}
            onChange={e => setOtherLabel(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-red-500/40"
          />
          <div className="flex items-baseline gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={otherCarbs}
              onChange={e => setOtherCarbs(e.target.value)}
              placeholder="0"
              className="text-3xl font-bold text-white bg-transparent outline-none w-20"
            />
            <span className="text-gray-500">grams</span>
          </div>
        </div>
      )}

      {/* Notes */}
      <input
        type="text"
        placeholder="Notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-red-500/30"
      />

      {/* Summary + log */}
      <div className="space-y-3">
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl px-5 py-4">
          <p className="text-[10px] tracking-widest text-red-400 font-semibold">GIVING</p>
          <p className="text-2xl font-bold text-white mt-1">{totalCarbs}g fast carbs</p>
          <p className="text-xs text-gray-500 mt-0.5">{treatmentLabel}</p>
        </div>
        {error && <p className="text-xs text-red-400 text-center">{error}</p>}
        <button
          onClick={submit}
          disabled={totalCarbs === 0 || submitting}
          className="w-full bg-red-500/20 border border-red-500/30 text-red-300 font-semibold py-4 rounded-2xl text-sm disabled:opacity-40"
        >
          {submitting ? 'Logging...' : `Log ${totalCarbs}g`}
        </button>
      </div>
    </div>
  )
}
