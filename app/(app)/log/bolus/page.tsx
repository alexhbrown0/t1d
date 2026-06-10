'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface FoodItem {
  name: string
  qty: number
  carbs: number
  fat: number | null
  protein: number | null
  gi_category: 'high' | 'medium' | 'low' | null
}

interface RepoFood {
  id: string
  name: string
  carbs_g: number
  fat_g: number | null
  protein_g: number | null
  gi_category: 'high' | 'medium' | 'low' | null
  serving_size: string
  category: string | null
}

const JUICE_CARBS = 15
const GUMMY_CARBS = 5

export default function LogBolusPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'capture' | 'library' | 'items' | 'low_treatment' | 'dose'>('capture')
  const [analyzing, setAnalyzing] = useState(false)
  const [items, setItems] = useState<FoodItem[]>([])
  const [mealGi, setMealGi] = useState<'high' | 'medium' | 'low' | null>(null)
  const [dose, setDose] = useState<{ grams: number; reasoning: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [currentBg, setCurrentBg] = useState<{ value: number; trend: string; arrow: string; delta: number | null } | null>(null)
  const [lowTreatment, setLowTreatment] = useState<{ type: string; carbs: number; label: string } | null>(null)
  const [foodRepo, setFoodRepo] = useState<RepoFood[]>([])
  const [librarySearch, setLibrarySearch] = useState('')
  const [pickingFood, setPickingFood] = useState<{ food: RepoFood; qty: string } | null>(null)
  const [gummyCount, setGummyCount] = useState(1)
  const [otherExpanded, setOtherExpanded] = useState(false)
  const [otherLabel, setOtherLabel] = useState('')
  const [otherCarbs, setOtherCarbs] = useState('')

  const TREND_ARROW: Record<string, string> = {
    rising: '↑', risingQuickly: '↑↑', steady: '→',
    falling: '↓', fallingQuickly: '↓↓', fortyFiveUp: '↗', fortyFiveDown: '↘',
  }

  useEffect(() => {
    fetch('/api/t1d/bg-latest')
      .then(r => r.json())
      .then(d => {
        const reading = Array.isArray(d) ? d[0] : d
        const prev = Array.isArray(d) ? d[1] : null
        if (!reading?.value_mgdl) return
        const gapMs = reading && prev
          ? new Date(reading.system_time).getTime() - new Date(prev.system_time).getTime()
          : Infinity
        const delta = prev?.value_mgdl != null && gapMs <= 10 * 60 * 1000
          ? Math.round(reading.value_mgdl - prev.value_mgdl)
          : null
        setCurrentBg({
          value: reading.value_mgdl,
          trend: reading.trend ?? 'none',
          arrow: TREND_ARROW[reading.trend] ?? '',
          delta,
        })
      })
      .catch(() => null)
  }, [])

  const isLowOrDropping = currentBg != null && (
    currentBg.value < 80 ||
    (currentBg.value < 100 && (currentBg.trend === 'falling' || currentBg.trend === 'fallingQuickly'))
  )

  const analyzePhoto = async (file: File) => {
    setAnalyzing(true)
    const form = new FormData()
    form.append('photo', file)
    try {
      const res = await fetch('/api/t1d/carb-estimate', { method: 'POST', body: form })
      const data = await res.json()
      if (data.items) {
        setItems(data.items)
        setMealGi(data.meal_gi_category ?? null)
        setStep('items')
      }
    } catch {
      setStep('items')
    } finally {
      setAnalyzing(false)
    }
  }

  const openLibrary = async () => {
    if (foodRepo.length === 0) {
      const data = await fetch('/api/t1d/food-repo').then(r => r.json()).catch(() => [])
      setFoodRepo(Array.isArray(data) ? data : [])
    }
    setLibrarySearch('')
    setPickingFood(null)
    setStep('library')
  }

  const confirmLibraryPick = () => {
    if (!pickingFood) return
    const qty = parseFloat(pickingFood.qty)
    if (!qty || qty <= 0) { setPickingFood(null); return }
    const f = pickingFood.food
    setItems(prev => {
      const idx = prev.findIndex(i => i.name === f.name)
      const item: FoodItem = { name: f.name, qty, carbs: f.carbs_g, fat: f.fat_g ?? null, protein: f.protein_g ?? null, gi_category: f.gi_category }
      if (idx >= 0) return prev.map((i, n) => n === idx ? { ...i, qty } : i)
      return [...prev, item]
    })
    setPickingFood(null)
  }

  const addManualItem = () => {
    setItems(prev => [...prev, { name: '', qty: 1, carbs: 0, fat: null, protein: null, gi_category: null }])
    setStep('items')
  }

  const totalCarbs = items.reduce((sum, i) => sum + i.carbs * i.qty, 0)

  const proceedFromItems = () => {
    if (isLowOrDropping) {
      setStep('low_treatment')
    } else {
      getDose(null)
    }
  }

  const getDose = async (treatment: { type: string; carbs: number; label?: string } | null) => {
    if (treatment) setLowTreatment({ ...treatment, label: treatment.label ?? treatment.type })
    const res = await fetch('/api/t1d/engine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items,
        context: 'home_dinner',
        meal_gi_category: mealGi,
        low_treatment_carbs: treatment?.carbs ?? 0,
        low_treatment_type: treatment?.type ?? null,
        starting_bg: currentBg?.value ?? null,
        starting_trend: currentBg?.trend ?? null,
      }),
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
        meal_gi_category: mealGi,
        starting_bg: currentBg?.value ?? null,
        starting_trend: currentBg?.trend ?? null,
        low_treatment_type: lowTreatment?.type ?? null,
        low_treatment_carbs: lowTreatment?.carbs ?? null,
        entered_by: 'alexandra',
      }),
    }).catch(() => null)
    router.push('/now')
  }

  const bgColor = currentBg
    ? currentBg.value < 70 ? 'text-red-400'
    : currentBg.value < 85 ? 'text-orange-400'
    : 'text-teal-400'
    : 'text-gray-500'

  return (
    <div className="px-4 pt-5 pb-4 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => (step === 'capture' ? router.back() : setStep(step === 'dose' ? (isLowOrDropping ? 'low_treatment' : 'items') : step === 'low_treatment' ? 'items' : step === 'library' ? 'capture' : 'capture'))} className="text-gray-500">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex-1">
          <p className="text-[10px] tracking-widest text-blue-400 font-semibold">BOLUS</p>
          <p className="text-lg font-semibold text-white">Food Bolus</p>
        </div>
        {currentBg && (
          <div className="flex items-center gap-1.5">
            <p className={`text-sm font-bold tabular-nums ${bgColor}`}>{Math.round(currentBg.value)}</p>
            {currentBg.arrow && <span className={`text-sm ${bgColor}`}>{currentBg.arrow}</span>}
            {currentBg.delta != null && (
              <span className={`text-xs font-semibold tabular-nums ${currentBg.delta < 0 ? 'text-red-400' : currentBg.delta > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
                {currentBg.delta > 0 ? '+' : ''}{currentBg.delta}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Low warning banner */}
      {isLowOrDropping && step !== 'low_treatment' && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3">
          <p className="text-xs text-orange-400 font-semibold">
            BG {currentBg!.value < 80 ? 'is low' : 'dropping'} — you'll confirm fast carb treatment before dosing
          </p>
        </div>
      )}

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
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) analyzePhoto(f) }}
            />
          </label>
          {analyzing && (
            <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-4 text-center">
              <p className="text-sm text-teal-400 animate-pulse">Analyzing photo...</p>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={openLibrary} className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 text-xs text-gray-400 font-semibold">
              Pick from library
            </button>
            <button onClick={addManualItem} className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 text-xs text-gray-400 font-semibold">
              Skip · manual
            </button>
          </div>
        </div>
      )}

      {/* Library picker step */}
      {step === 'library' && (
        <div className="space-y-3">
          {pickingFood ? (
            <div className="bg-[#141414] rounded-2xl border border-blue-500/30 p-5 space-y-4">
              <div>
                <p className="text-[10px] tracking-widest text-blue-400 font-semibold">HOW MUCH?</p>
                <p className="text-base font-semibold text-white mt-1">{pickingFood.food.name}</p>
                <p className="text-xs text-gray-500">per {pickingFood.food.serving_size}</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  value={pickingFood.qty}
                  onChange={e => setPickingFood(p => p ? { ...p, qty: e.target.value } : null)}
                  autoFocus
                  className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-semibold text-center focus:outline-none focus:border-blue-500/50"
                />
                <div className="text-right w-20 flex-shrink-0">
                  <p className="text-2xl font-bold text-blue-400 tabular-nums">
                    {parseFloat(pickingFood.qty) > 0 ? Math.round(pickingFood.food.carbs_g * parseFloat(pickingFood.qty)) : 0}g
                  </p>
                  <p className="text-[10px] text-gray-500">carbs</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPickingFood(null)} className="flex-1 bg-white/5 border border-white/10 text-gray-400 text-sm font-semibold py-3 rounded-xl">Cancel</button>
                <button onClick={confirmLibraryPick} className="flex-1 bg-blue-500/20 border border-blue-500/30 text-blue-300 font-bold py-3 rounded-xl">Add</button>
              </div>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Search foods…"
                value={librarySearch}
                onChange={e => setLibrarySearch(e.target.value)}
                className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50"
              />
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {foodRepo
                  .filter(f => !librarySearch || f.name.toLowerCase().includes(librarySearch.toLowerCase()))
                  .slice(0, 40)
                  .map(food => (
                    <div key={food.id} className="bg-[#141414] rounded-xl border border-white/5 px-4 py-2.5 flex items-center justify-between">
                      <div className="min-w-0 flex-1 pr-3">
                        <p className="text-sm text-white truncate">{food.name}</p>
                        <p className="text-[10px] text-gray-500">{food.carbs_g}g · {food.serving_size}</p>
                      </div>
                      <button
                        onClick={() => setPickingFood({ food, qty: '1' })}
                        className="bg-white/10 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
                      >
                        Add
                      </button>
                    </div>
                  ))}
              </div>
              {items.length > 0 && (
                <button
                  onClick={() => setStep('items')}
                  className="w-full bg-blue-500/20 border border-blue-500/30 text-blue-300 font-bold py-3.5 rounded-2xl text-sm"
                >
                  Done · {items.length} item{items.length !== 1 ? 's' : ''} added
                </button>
              )}
            </>
          )}
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
                  {item.gi_category && (
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                      item.gi_category === 'high' ? 'text-orange-400 bg-orange-500/10' :
                      item.gi_category === 'medium' ? 'text-yellow-400 bg-yellow-500/10' :
                      'text-green-400 bg-green-500/10'
                    }`}>{item.gi_category} GI</span>
                  )}
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
                <button onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-700">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          <button onClick={addManualItem} className="w-full bg-white/5 border border-dashed border-white/10 rounded-2xl py-3 text-xs text-gray-500">
            + Add item
          </button>
          <div className="bg-[#141414] rounded-2xl border border-blue-500/20 px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500 font-semibold">TOTAL CARBS</p>
              <p className="text-2xl font-bold text-white">{totalCarbs}g</p>
              {mealGi && (
                <p className={`text-[10px] font-semibold mt-0.5 ${mealGi === 'high' ? 'text-orange-400' : mealGi === 'medium' ? 'text-yellow-400' : 'text-green-400'}`}>
                  {mealGi.toUpperCase()} GI MEAL
                </p>
              )}
            </div>
            <button
              onClick={proceedFromItems}
              disabled={items.length === 0 || totalCarbs === 0}
              className="bg-blue-500/20 border border-blue-500/30 text-blue-300 text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-40"
            >
              {isLowOrDropping ? 'Next →' : 'Get Dose'}
            </button>
          </div>
        </div>
      )}

      {/* Low treatment step */}
      {step === 'low_treatment' && (
        <div className="space-y-4">
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl px-5 py-4">
            <p className="text-[10px] tracking-widest text-orange-400 font-semibold mb-1">BG IS {currentBg?.value} — LOW AT MEALTIME</p>
            {mealGi === 'high' ? (
              <p className="text-sm text-gray-300 leading-relaxed">
                This is a high-GI meal — it will bring BG up on its own. A full juice may cause a spike. Choose below based on how fast BG is dropping.
              </p>
            ) : (
              <p className="text-sm text-gray-300 leading-relaxed">
                This meal is {mealGi ?? 'unknown'} GI — it won't bring BG up quickly. Fast carbs before eating are likely needed.
              </p>
            )}
          </div>

          <p className="text-[10px] tracking-widest text-gray-500 font-semibold">FAST CARBS GIVEN BEFORE/DURING MEAL</p>
          <div className="space-y-2">

            {/* Juice */}
            <div className="bg-[#141414] border border-white/10 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 font-semibold mb-2">Juice · {JUICE_CARBS}g per bottle</p>
              <div className="flex gap-2">
                <button
                  onClick={() => getDose({ type: 'Half juice', carbs: Math.round(JUICE_CARBS / 2) })}
                  className="flex-1 bg-orange-500/10 border border-orange-500/20 text-orange-300 text-sm font-semibold py-2.5 rounded-lg active:opacity-70"
                >
                  Half · {Math.round(JUICE_CARBS / 2)}g
                </button>
                <button
                  onClick={() => getDose({ type: 'Full juice', carbs: JUICE_CARBS })}
                  className="flex-1 bg-orange-500/15 border border-orange-500/30 text-orange-300 text-sm font-semibold py-2.5 rounded-lg active:opacity-70"
                >
                  Full · {JUICE_CARBS}g
                </button>
              </div>
            </div>

            {/* Gummies */}
            <div className="bg-[#141414] border border-white/10 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 font-semibold mb-2">Gummies · {GUMMY_CARBS}g each</p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <button onClick={() => setGummyCount(c => Math.max(1, c - 1))} className="w-8 h-8 rounded-lg bg-white/5 text-white font-bold flex items-center justify-center">−</button>
                  <span className="text-white font-semibold text-sm w-6 text-center tabular-nums">{gummyCount}</span>
                  <button onClick={() => setGummyCount(c => c + 1)} className="w-8 h-8 rounded-lg bg-white/5 text-white font-bold flex items-center justify-center">+</button>
                  <span className="text-gray-500 text-xs">= {gummyCount * GUMMY_CARBS}g</span>
                </div>
                <button
                  onClick={() => getDose({ type: `${gummyCount} gumm${gummyCount === 1 ? 'y' : 'ies'}`, carbs: gummyCount * GUMMY_CARBS })}
                  className="bg-orange-500/15 border border-orange-500/30 text-orange-300 text-sm font-semibold px-4 py-2.5 rounded-lg active:opacity-70"
                >
                  Use
                </button>
              </div>
            </div>

            {/* Other */}
            <div className="bg-[#141414] border border-white/10 rounded-xl px-4 py-3">
              {!otherExpanded ? (
                <button onClick={() => setOtherExpanded(true)} className="w-full text-left text-sm text-gray-400 font-semibold">Other →</button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 font-semibold">Other fast carbs</p>
                  <input
                    type="text"
                    placeholder="What was given?"
                    value={otherLabel}
                    onChange={e => setOtherLabel(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-orange-500/40"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="Carbs (g)"
                      value={otherCarbs}
                      onChange={e => setOtherCarbs(e.target.value)}
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-orange-500/40"
                    />
                    <button
                      onClick={() => {
                        const c = parseInt(otherCarbs)
                        if (c > 0) getDose({ type: otherLabel || 'Other', carbs: c })
                      }}
                      disabled={!otherCarbs || parseInt(otherCarbs) <= 0}
                      className="bg-orange-500/15 border border-orange-500/30 text-orange-300 text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40"
                    >
                      Use
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* None */}
            <button
              onClick={() => getDose({ type: 'None', carbs: 0 })}
              className="w-full bg-[#141414] border border-white/10 rounded-xl px-5 py-3.5 text-left text-sm text-gray-500 font-semibold active:bg-white/5"
            >
              None — dose without treatment
            </button>
          </div>
        </div>
      )}

      {/* Dose step */}
      {step === 'dose' && dose && (
        <div className="space-y-3">
          {lowTreatment && lowTreatment.carbs > 0 && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <span className="text-xs text-orange-400">{lowTreatment.label} ({lowTreatment.carbs}g fast carbs) factored in</span>
            </div>
          )}
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
            <button onClick={() => setStep('items')} className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-4 text-sm text-gray-400 font-semibold">
              Edit items
            </button>
            <button onClick={logDose} disabled={submitting} className="flex-1 bg-blue-500/20 border border-blue-500/30 text-blue-300 font-semibold py-4 rounded-2xl text-sm">
              {submitting ? 'Logging...' : 'I did it'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
