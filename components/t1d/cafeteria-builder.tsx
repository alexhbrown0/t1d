'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { logEvent } from '@/lib/t1d/device'
import type { T1dCafeteriaMenuItem } from '@/types/health'

interface PlateItem {
  name: string
  carbs: number // per unit
  qty: number
  fat: number | null
  protein: number | null
  food_repo_id: string | null
}

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

const CATEGORY_ORDER = ['entree', 'side', 'milk', 'condiment', 'other'] as const
const CATEGORY_LABEL: Record<string, string> = {
  entree: 'ENTRÉES', side: 'SIDES', milk: 'MILK', condiment: 'CONDIMENTS', other: 'OTHER',
}

export function CafeteriaBuilder({
  menu,
  stapleNames,
  existingMealId,
  initialSelectedNames,
  saveTimestamp,
  targetLabel,
  onSaved,
}: {
  menu: T1dCafeteriaMenuItem[]
  stapleNames: string[]
  existingMealId: string | null
  initialSelectedNames: string[]
  saveTimestamp: string
  targetLabel: string
  onSaved?: () => void
}) {
  const router = useRouter()
  const [items, setItems] = useState<PlateItem[]>(
    () => menu.filter(m => initialSelectedNames.includes(m.name)).map(m => ({
      name: m.name, carbs: Number(m.carbs_g), qty: 1, fat: null, protein: null, food_repo_id: null,
    }))
  )
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [photoNote, setPhotoNote] = useState('')
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [manual, setManual] = useState<{ name: string; carbs: string } | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  const totalCarbs = Math.round(items.reduce((s, i) => s + i.carbs * i.qty, 0))

  const addItem = (it: PlateItem) => {
    setItems(prev => prev.some(p => p.name.toLowerCase() === it.name.toLowerCase()) ? prev : [...prev, it])
  }

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setAnalyzing(true)
    setPhotoError(null)
    try {
      const form = new FormData()
      form.append('photo', file)
      if (photoNote.trim()) form.append('hint', photoNote.trim())
      form.append('menu', JSON.stringify(menu.map(m => ({ name: m.name, carbs: Math.round(Number(m.carbs_g)) }))))
      const resp = await fetch('/api/t1d/carb-estimate', { method: 'POST', body: form })
      const data = await resp.json()
      if (!resp.ok || data.ai_unavailable) {
        setPhotoError(data.error ?? 'Photo analysis failed. Add items from the menu below.')
        return
      }
      const detected = (data.items ?? []) as Array<{ name: string; carbs: number; qty: number; fat: number | null; protein: number | null; matched_repo_id: string | null }>
      setItems(prev => {
        const have = new Set(prev.map(p => p.name.toLowerCase()))
        const additions = detected
          .filter(d => !have.has(d.name.toLowerCase()))
          .map(d => ({ name: d.name, carbs: d.carbs, qty: d.qty ?? 1, fat: d.fat ?? null, protein: d.protein ?? null, food_repo_id: d.matched_repo_id ?? null }))
        return [...prev, ...additions]
      })
    } finally {
      setAnalyzing(false)
    }
  }

  const setQty = (i: number, delta: number) =>
    setItems(prev => prev.map((p, j) => j === i ? { ...p, qty: Math.max(1, p.qty + delta) } : p))

  const setTotal = (i: number, raw: string) => {
    const total = parseFloat(raw)
    if (isNaN(total) || total < 0) return
    setItems(prev => prev.map((p, j) => j === i ? { ...p, carbs: p.qty > 0 ? Math.round((total / p.qty) * 10) / 10 : total } : p))
  }

  const remove = (i: number) => setItems(prev => prev.filter((_, j) => j !== i))

  const useManual = () => {
    if (!manual || !manual.carbs) return
    addItem({ name: manual.name.trim() || 'Item', carbs: parseFloat(manual.carbs) || 0, qty: 1, fat: null, protein: null, food_repo_id: null })
    setManual(null)
  }

  const save = async () => {
    if (items.length === 0) return
    setSaving(true)
    try {
      const payload = items.map(i => ({
        food_repo_id: i.food_repo_id,
        name: i.name,
        qty_offered: i.qty,
        qty_eaten: null,
        carbs: i.carbs,
        fat: i.fat,
        protein: i.protein,
      }))
      if (existingMealId) {
        await fetch(`/api/t1d/meal/${existingMealId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items_offered: payload, is_cafeteria: true, entered_by: 'alexandra' }),
        })
      } else {
        await fetch('/api/t1d/meal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: 'school_lunch', is_cafeteria: true, source: 'photo', items: payload, entered_by: 'alexandra', timestamp: saveTimestamp }),
        })
      }
      await logEvent('meal', `Cafeteria lunch loaded · ${totalCarbs}g`)
      if (onSaved) onSaved()
      else router.push('/lunch')
    } finally {
      setSaving(false)
    }
  }

  const stapleSet = new Set(stapleNames)
  const featured = menu.filter(m => !stapleSet.has(m.name))
  const grouped = CATEGORY_ORDER.map(cat => ({
    cat, items: featured.filter(m => (m.category ?? 'other') === cat),
  })).filter(g => g.items.length > 0)
  const staples = menu.filter(m => stapleSet.has(m.name))

  const menuAddButton = (m: T1dCafeteriaMenuItem) => {
    const added = items.some(p => p.name.toLowerCase() === m.name.toLowerCase())
    return (
      <button key={m.id}
        onClick={() => added ? setItems(prev => prev.filter(p => p.name.toLowerCase() !== m.name.toLowerCase())) : addItem({ name: m.name, carbs: Number(m.carbs_g), qty: 1, fat: null, protein: null, food_repo_id: null })}
        className={`w-full rounded-xl border px-4 py-3 flex items-center gap-3 text-left active:opacity-80 ${added ? 'bg-teal-500/10 border-teal-500/40' : 'bg-[#141414] border-white/5'}`}>
        <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${added ? 'border-teal-500 bg-teal-500' : 'border-gray-600'}`}>
          {added && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
        </div>
        <span className="text-sm text-white flex-1 min-w-0">{m.name}</span>
        <span className="text-xs text-teal-400 flex-shrink-0">{Math.round(Number(m.carbs_g))}g</span>
      </button>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">Take a photo of his tray — AI reads each item (using today&apos;s menu) and estimates carbs. Confirm or tweak below.</p>

      {/* Photo-first capture */}
      <div className="space-y-2">
        <input
          type="text" value={photoNote} onChange={e => setPhotoNote(e.target.value)}
          placeholder="Optional note first (e.g. small chips, 1 brownie)"
          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50"
        />
        <button onClick={() => photoRef.current?.click()} disabled={analyzing}
          className="w-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold py-3.5 rounded-xl active:opacity-70 disabled:opacity-60 flex items-center justify-center gap-2">
          {analyzing ? <><Spinner /> Reading tray…</> : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
              </svg>
              {items.length > 0 ? 'Add another tray photo' : 'Take tray photo'}
            </>
          )}
        </button>
        {photoError && <p className="text-xs text-amber-400">{photoError}</p>}
        <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
      </div>

      {/* Review list */}
      {items.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] tracking-widest text-teal-400 font-semibold">ON HIS PLATE · {totalCarbs}g</p>
          {items.map((item, i) => (
            <div key={i} className="bg-[#141414] rounded-xl border border-white/5 px-4 py-3 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <input
                  value={item.name}
                  onChange={e => setItems(prev => prev.map((p, j) => j === i ? { ...p, name: e.target.value } : p))}
                  className="w-full bg-transparent text-sm text-white outline-none border-b border-transparent focus:border-teal-500/40"
                />
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setQty(i, -1)} className="w-6 h-6 rounded-md bg-white/5 text-white text-base font-bold flex items-center justify-center">−</button>
                <span className="text-white text-sm font-semibold w-4 text-center tabular-nums">{item.qty}</span>
                <button onClick={() => setQty(i, 1)} className="w-6 h-6 rounded-md bg-white/5 text-white text-base font-bold flex items-center justify-center">+</button>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <input
                  type="number" inputMode="decimal" step="1" min="0"
                  value={Math.round(item.carbs * item.qty)}
                  onChange={e => setTotal(i, e.target.value)}
                  className="w-12 bg-black/40 border border-white/10 rounded-lg px-1 py-1.5 text-teal-400 text-xs text-right tabular-nums focus:outline-none focus:border-teal-500/50"
                />
                <span className="text-[10px] text-gray-600">g</span>
              </div>
              <button onClick={() => remove(i)} className="text-gray-600 active:text-red-400 flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Manual add */}
      {manual ? (
        <div className="bg-[#141414] rounded-2xl border border-white/5 p-4 space-y-3">
          <input type="text" value={manual.name} onChange={e => setManual({ ...manual, name: e.target.value })}
            placeholder="Item name"
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50" />
          <div className="flex items-baseline gap-2">
            <input type="number" inputMode="numeric" value={manual.carbs} onChange={e => setManual({ ...manual, carbs: e.target.value })}
              placeholder="0" className="w-24 text-2xl font-bold text-white bg-transparent outline-none" autoFocus />
            <span className="text-gray-500 text-sm">grams carbs</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setManual(null)} className="flex-1 bg-white/5 border border-white/10 text-gray-400 text-sm py-2.5 rounded-xl">Cancel</button>
            <button onClick={useManual} disabled={!manual.carbs} className="flex-1 bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold py-2.5 rounded-xl disabled:opacity-40">Add</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setManual({ name: '', carbs: '' })} className="w-full text-xs text-gray-500 py-1.5 active:text-gray-300">
          + Add an item manually
        </button>
      )}

      {/* Add from today's menu (fallback) */}
      {menu.length > 0 && (
        <div className="space-y-2">
          <button onClick={() => setMenuOpen(o => !o)} className="w-full flex items-center justify-between px-1 py-1">
            <span className="text-[10px] tracking-widest text-gray-500 font-semibold">ADD FROM TODAY&apos;S MENU</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {menuOpen && (
            <div className="space-y-4">
              {grouped.map(({ cat, items: gi }) => (
                <div key={cat} className="space-y-2">
                  <p className="text-[10px] tracking-widest text-gray-600 font-semibold">{CATEGORY_LABEL[cat]}</p>
                  {gi.map(menuAddButton)}
                </div>
              ))}
              {staples.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] tracking-widest text-gray-600 font-semibold">ALWAYS AVAILABLE</p>
                  {staples.map(menuAddButton)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {menu.length === 0 && items.length === 0 && (
        <p className="text-xs text-gray-600 text-center">
          No cafeteria menu loaded for {targetLabel.toLowerCase()} — the photo still works, or{' '}
          <Link href="/engine/menu" className="text-teal-400 font-semibold">upload the menu →</Link>
        </p>
      )}

      {items.length > 0 && (
        <div className="sticky bottom-4 pt-2">
          <button onClick={save} disabled={saving}
            className="w-full bg-teal-500 text-black font-bold py-4 rounded-2xl active:opacity-80 disabled:opacity-50">
            {saving ? <span className="flex items-center justify-center gap-2"><Spinner /> Saving…</span> : `Load ${items.length} item${items.length === 1 ? '' : 's'} · ${totalCarbs}g →`}
          </button>
        </div>
      )}
    </div>
  )
}
