'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { T1dFoodRepo } from '@/types/health'
import type { RecentItem } from '@/components/t1d/lunch-builder'

interface Selected {
  food_repo_id: string | null
  name: string
  carbs: number
  fat: number | null
  protein: number | null
  qty: number
  serving_size: string
}

interface ExistingSnack {
  meal_id: string
  session_id: string | null
  recommended_dose_grams: number | null
  actual_dose_grams: number | null
  item_name: string | null
  total_carbs: number | null
}

type Tab = 'common' | 'search' | 'photo'

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

export function SnackFlow({
  foodRepo,
  recentSnacks,
  existing,
}: {
  foodRepo: T1dFoodRepo[]
  recentSnacks: RecentItem[]
  existing: ExistingSnack | null
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('common')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Selected | null>(null)
  const [session, setSession] = useState<{ id: string; recommended: number; reasoning: string | null } | null>(
    existing?.session_id && existing.actual_dose_grams == null
      ? { id: existing.session_id, recommended: existing.recommended_dose_grams ?? 0, reasoning: null }
      : null
  )
  const [overrideDose, setOverrideDose] = useState('')
  const [units, setUnits] = useState('')
  const [minutesAgo, setMinutesAgo] = useState(0)
  const [analyzing, setAnalyzing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState<{ name: string; carbs: string } | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  const dosed = existing?.actual_dose_grams != null

  const pickRepo = (f: T1dFoodRepo) => setSelected({
    food_repo_id: f.id, name: f.name, carbs: f.carbs_g,
    fat: f.fat_g ?? null, protein: f.protein_g ?? null, qty: 1, serving_size: f.serving_size,
  })
  const pickRecent = (r: RecentItem) => setSelected({
    food_repo_id: r.food_repo_id, name: r.name, carbs: r.carbs,
    fat: r.fat ?? null, protein: r.protein ?? null, qty: 1, serving_size: r.serving_size,
  })

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setAnalyzing(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('photo', file)
      const resp = await fetch('/api/t1d/carb-estimate', { method: 'POST', body: form })
      const data = await resp.json()
      if (!resp.ok || data.ai_unavailable) {
        setError(data.error ?? 'Photo analysis failed. Enter the snack manually below.')
        setManual({ name: '', carbs: '' })
        return
      }
      const items = (data.items ?? []) as Array<{ name: string; carbs: number; fat: number | null; protein: number | null; qty: number; matched_repo_id: string | null }>
      if (items.length === 0) { setError('No food detected. Enter it manually.'); setManual({ name: '', carbs: '' }); return }
      // Combine detected items into a single snack
      const carbs = items.reduce((s, i) => s + i.carbs * (i.qty ?? 1), 0)
      setSelected({
        food_repo_id: items[0].matched_repo_id ?? null,
        name: items.length === 1 ? items[0].name : items.map(i => i.name).join(' + '),
        carbs: Math.round(carbs),
        fat: items[0].fat ?? null,
        protein: items[0].protein ?? null,
        qty: 1,
        serving_size: '1 serving',
      })
    } finally {
      setAnalyzing(false)
    }
  }

  const useManual = () => {
    if (!manual || !manual.carbs) return
    setSelected({
      food_repo_id: null,
      name: manual.name.trim() || 'Snack',
      carbs: parseFloat(manual.carbs) || 0,
      fat: null, protein: null, qty: 1, serving_size: '1 serving',
    })
    setManual(null)
  }

  const getDose = async () => {
    if (!selected) return
    setLoading(true)
    setError(null)
    try {
      const mealItem = {
        food_repo_id: selected.food_repo_id,
        name: selected.name,
        carbs: selected.carbs,
        fat: selected.fat,
        protein: selected.protein,
        qty_offered: selected.qty,
        qty_eaten: null,
      }
      const mealRes = await fetch('/api/t1d/meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: 'snack', items: [mealItem], source: 'manual', entered_by: 'alexandra' }),
      })
      const meal = await mealRes.json()
      if (!mealRes.ok) { setError(meal.error ?? 'Could not save the snack.'); return }

      const bgRes = await fetch('/api/t1d/bg-latest').then(r => r.json()).catch(() => null)
      const freshBg = Array.isArray(bgRes) ? bgRes[0] : bgRes
      const engRes = await fetch('/api/t1d/engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meal: [mealItem],
          meal_event_id: meal.id,
          starting_bg: freshBg?.value_mgdl ?? null,
          starting_trend: freshBg?.trend ?? null,
          entered_by: 'alexandra',
        }),
      })
      const eng = await engRes.json()
      if (!engRes.ok) {
        setError(eng.error ?? 'Dose calculation failed. Dose manually via the pump for ' + selected.carbs + 'g.')
        return
      }
      setSession({ id: eng.session_id, recommended: eng.dose_now_grams ?? 0, reasoning: eng.reasoning ?? null })
    } catch {
      setError('Network error. Try again, or dose manually via the pump.')
    } finally {
      setLoading(false)
    }
  }

  const confirm = async () => {
    if (!session) return
    setLoading(true)
    try {
      await fetch(`/api/t1d/dose-session/${session.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actual_dose_grams: overrideDose ? parseFloat(overrideDose) : session.recommended,
          pump_suggested_units: units ? parseFloat(units) : undefined,
          entered_by: 'alexandra',
          actual_dose_timestamp: minutesAgo > 0 ? new Date(Date.now() - minutesAgo * 60000).toISOString() : undefined,
        }),
      })
      router.push('/now')
    } finally {
      setLoading(false)
    }
  }

  if (dosed) {
    return (
      <div className="bg-[#141414] rounded-2xl border border-teal-500/20 p-5 text-center space-y-2">
        <p className="text-[10px] tracking-widest text-teal-400 font-semibold">SNACK COMPLETE</p>
        <p className="text-sm text-white">{existing?.item_name} · dosed {existing?.actual_dose_grams}g ✓</p>
      </div>
    )
  }

  // ── Dose stage ──
  if (session) {
    return (
      <div className="space-y-4">
        <div className="bg-[#141414] rounded-2xl border border-white/5 px-4 py-3">
          <p className="text-sm text-white">{selected?.name}</p>
          <p className="text-[10px] text-gray-500">{selected?.carbs}g carbs</p>
        </div>
        <div className="bg-[#141414] rounded-2xl border border-teal-500/30 p-5 space-y-4">
          <p className="text-[10px] tracking-widest text-teal-400 font-semibold">SNACK DOSE</p>
          <div className="flex items-baseline gap-2">
            <input
              type="number" inputMode="decimal" step="1"
              value={overrideDose || session.recommended}
              onChange={e => setOverrideDose(e.target.value)}
              className="w-24 bg-black/40 border border-teal-500/40 rounded-xl px-3 py-2 text-4xl font-bold text-white focus:outline-none"
            />
            <span className="text-gray-500 text-sm">g into pump</span>
          </div>
          {session.reasoning && <p className="text-xs text-gray-400 leading-relaxed">{session.reasoning}</p>}
          <div>
            <label className="text-[10px] tracking-widest text-gray-500 font-semibold">INSULIN UNITS (what the pump showed)</label>
            <input
              type="number" step="0.01" inputMode="decimal" value={units}
              onChange={e => setUnits(e.target.value)} placeholder="e.g. 0.85"
              className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50"
            />
          </div>
          <div className="flex gap-1.5">
            {[0, 5, 10, 15].map(m => (
              <button key={m} onClick={() => setMinutesAgo(m)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold ${minutesAgo === m ? 'bg-teal-500/20 border border-teal-500/40 text-teal-300' : 'bg-white/5 border border-white/10 text-gray-400'}`}>
                {m === 0 ? 'Now' : `${m}m ago`}
              </button>
            ))}
          </div>
          <button onClick={confirm} disabled={loading}
            className="w-full bg-teal-500 text-black font-bold py-4 rounded-2xl active:opacity-80 disabled:opacity-50">
            {loading ? <span className="flex items-center justify-center gap-2"><Spinner /> Saving…</span> : `Dose Given${minutesAgo > 0 ? ` (${minutesAgo}m ago)` : ''} ✓`}
          </button>
        </div>
      </div>
    )
  }

  // ── Pick stage ──
  const results = search.trim()
    ? foodRepo.filter(f => f.name.toLowerCase().includes(search.toLowerCase())).slice(0, 20)
    : []

  return (
    <div className="space-y-4">
      {selected && (
        <div className="bg-[#141414] rounded-2xl border border-teal-500/30 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white truncate">{selected.name}</p>
            <p className="text-[10px] text-gray-500">{selected.carbs}g carbs</p>
          </div>
          <button onClick={() => setSelected(null)} className="text-xs text-gray-500">Change</button>
        </div>
      )}

      {error && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 space-y-1">
          <p className="text-[10px] tracking-widest text-amber-400 font-semibold">AI UNAVAILABLE</p>
          <p className="text-xs text-gray-300">{error}</p>
        </div>
      )}

      {selected ? (
        <button onClick={getDose} disabled={loading}
          className="w-full bg-teal-500 text-black font-bold py-4 rounded-2xl active:opacity-80 disabled:opacity-50">
          {loading ? <span className="flex items-center justify-center gap-2"><Spinner /> Calculating…</span> : 'Get Snack Dose →'}
        </button>
      ) : manual ? (
        <div className="bg-[#141414] rounded-2xl border border-white/5 p-4 space-y-3">
          <p className="text-[10px] tracking-widest text-gray-500 font-semibold">MANUAL ENTRY</p>
          <input type="text" value={manual.name} onChange={e => setManual({ ...manual, name: e.target.value })}
            placeholder="Snack name (optional)"
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50" />
          <div className="flex items-baseline gap-2">
            <input type="number" inputMode="numeric" value={manual.carbs} onChange={e => setManual({ ...manual, carbs: e.target.value })}
              placeholder="0" className="w-24 text-3xl font-bold text-white bg-transparent outline-none" autoFocus />
            <span className="text-gray-500">grams carbs</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setManual(null)} className="flex-1 bg-white/5 border border-white/10 text-gray-400 text-sm py-3 rounded-xl">Cancel</button>
            <button onClick={useManual} disabled={!manual.carbs} className="flex-1 bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold py-3 rounded-xl disabled:opacity-40">Use This</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex w-full gap-1 bg-white/5 rounded-xl p-1">
            {(['common', 'search', 'photo'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 text-[11px] font-semibold py-2 rounded-lg capitalize ${tab === t ? 'bg-white/10 text-white' : 'text-gray-500'}`}>
                {t}
              </button>
            ))}
          </div>

          {tab === 'common' && (
            <div className="space-y-2">
              {recentSnacks.length === 0 && <p className="text-xs text-gray-600 text-center py-6">No recent snacks yet — search or take a photo.</p>}
              {recentSnacks.map((r, i) => (
                <button key={i} onClick={() => pickRecent(r)}
                  className="w-full bg-[#141414] border border-white/5 rounded-xl px-4 py-3 flex items-center justify-between active:opacity-70">
                  <span className="text-sm text-white">{r.name}</span>
                  <span className="text-xs text-teal-400">{r.carbs}g</span>
                </button>
              ))}
            </div>
          )}

          {tab === 'search' && (
            <div className="space-y-2">
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search snacks…"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50" autoFocus />
              {results.map(f => (
                <button key={f.id} onClick={() => pickRepo(f)}
                  className="w-full bg-[#141414] border border-white/5 rounded-xl px-4 py-3 flex items-center justify-between active:opacity-70">
                  <span className="text-sm text-white">{f.name}</span>
                  <span className="text-xs text-teal-400">{f.carbs_g}g</span>
                </button>
              ))}
            </div>
          )}

          {tab === 'photo' && (
            <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-10 text-center space-y-3">
              {analyzing ? (
                <p className="text-sm text-white">Analyzing photo…</p>
              ) : (
                <>
                  <p className="text-sm text-gray-400">Take a photo of the snack</p>
                  <button onClick={() => photoRef.current?.click()} className="bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold px-6 py-3 rounded-xl">Open Camera</button>
                  <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
                </>
              )}
            </div>
          )}

          <button onClick={() => setManual({ name: '', carbs: '' })} className="w-full text-xs text-gray-500 py-2 active:text-gray-300">
            Enter carbs manually
          </button>
        </>
      )}
    </div>
  )
}
