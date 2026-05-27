'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface FoodItem {
  name: string
  qty: number
  carbs: number
  fat: number | null
  protein: number | null
}

export default function LogBolusPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'capture' | 'items' | 'dose'>('capture')
  const [analyzing, setAnalyzing] = useState(false)
  const [items, setItems] = useState<FoodItem[]>([])
  const [dose, setDose] = useState<{ grams: number; reasoning: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const analyzePhoto = async (file: File) => {
    setAnalyzing(true)
    const form = new FormData()
    form.append('photo', file)
    try {
      const res = await fetch('/api/t1d/carb-estimate', { method: 'POST', body: form })
      const data = await res.json()
      if (data.items) {
        setItems(data.items)
        setStep('items')
        if (data.dose_grams) setDose({ grams: data.dose_grams, reasoning: data.reasoning ?? '' })
      }
    } catch {
      setStep('items')
    } finally {
      setAnalyzing(false)
    }
  }

  const addManualItem = () => {
    setItems(prev => [...prev, { name: '', qty: 1, carbs: 0, fat: null, protein: null }])
    setStep('items')
  }

  const totalCarbs = items.reduce((sum, i) => sum + i.carbs * i.qty, 0)

  const getDose = async () => {
    const res = await fetch('/api/t1d/engine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, context: 'home_dinner' }),
    }).catch(() => null)
    if (res?.ok) {
      const data = await res.json()
      setDose({ grams: data.dose_now_grams, reasoning: data.reasoning })
      setStep('dose')
    }
  }

  const logDose = async () => {
    setSubmitting(true)
    await fetch('/api/t1d/dose-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items,
        total_carbs: totalCarbs,
        recommended_dose_grams: dose?.grams,
        context: 'home_dinner',
        entered_by: 'alexandra',
      }),
    }).catch(() => null)
    router.push('/now')
  }

  return (
    <div className="px-4 pt-5 pb-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => (step === 'capture' ? router.back() : setStep('capture'))} className="text-gray-500">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <p className="text-[10px] tracking-widest text-blue-400 font-semibold">BOLUS</p>
          <p className="text-lg font-semibold text-white">Food Bolus</p>
        </div>
      </div>

      {/* Capture step */}
      {step === 'capture' && (
        <div className="space-y-3">
          <label>
            <div className="bg-[#141414] rounded-2xl border-2 border-dashed border-white/10 p-10 flex flex-col items-center gap-3 cursor-pointer active:border-blue-500/40">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-white">TAP TO TAKE PHOTO</p>
              <p className="text-xs text-gray-500">Claude will identify foods and estimate carbs</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) analyzePhoto(file)
              }}
            />
          </label>

          {analyzing && (
            <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-4 text-center">
              <p className="text-sm text-teal-400 animate-pulse">Analyzing photo...</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => {
                fileRef.current?.click()
              }}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 text-xs text-gray-400 font-semibold"
            >
              Pick from library
            </button>
            <button
              onClick={addManualItem}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 text-xs text-gray-400 font-semibold"
            >
              Skip · manual
            </button>
          </div>
        </div>
      )}

      {/* Items step */}
      {step === 'items' && (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="bg-[#141414] rounded-2xl border border-white/5 p-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <input
                    value={item.name}
                    onChange={e => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, name: e.target.value } : it))}
                    placeholder="Food name"
                    className="bg-transparent text-sm font-semibold text-white outline-none w-full"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={item.carbs}
                    onChange={e => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, carbs: Number(e.target.value) } : it))}
                    className="bg-transparent text-sm font-semibold text-blue-400 outline-none w-10 text-right"
                  />
                  <span className="text-xs text-gray-600">g</span>
                </div>
                <button
                  onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))}
                  className="text-gray-700"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={addManualItem}
            className="w-full bg-white/5 border border-dashed border-white/10 rounded-2xl py-3 text-xs text-gray-500"
          >
            + Add item
          </button>

          <div className="bg-[#141414] rounded-2xl border border-blue-500/20 px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500 font-semibold">TOTAL CARBS</p>
              <p className="text-2xl font-bold text-white">{totalCarbs}g</p>
            </div>
            <button
              onClick={getDose}
              disabled={items.length === 0 || totalCarbs === 0}
              className="bg-blue-500/20 border border-blue-500/30 text-blue-300 text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-40"
            >
              Get Dose
            </button>
          </div>
        </div>
      )}

      {/* Dose step */}
      {step === 'dose' && dose && (
        <div className="space-y-3">
          <div className="bg-[#141414] rounded-2xl border border-blue-500/20 p-5">
            <p className="text-[10px] tracking-widest text-blue-400 font-semibold mb-2">RECOMMENDED DOSE</p>
            <p className="text-4xl font-bold text-white">{dose.grams}g</p>
            <p className="text-xs text-gray-500 mt-1">Enter into the pump</p>
          </div>

          {dose.reasoning && (
            <div className="bg-[#141414] rounded-2xl border border-white/5 p-4">
              <p className="text-[10px] tracking-widest text-gray-500 font-semibold mb-2">REASONING</p>
              <p className="text-xs text-gray-400 leading-relaxed">{dose.reasoning}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep('items')}
              className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-4 text-sm text-gray-400 font-semibold"
            >
              Edit items
            </button>
            <button
              onClick={logDose}
              disabled={submitting}
              className="flex-1 bg-blue-500/20 border border-blue-500/30 text-blue-300 font-semibold py-4 rounded-2xl text-sm"
            >
              {submitting ? 'Logging...' : 'I did it'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
