'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { T1dFoodRepo, MealItem } from '@/types/health'

type Tab = 'items' | 'photo'

interface PackedItem {
  food_repo_id: string | null
  name: string
  carbs: number
  fat: number | null
  protein: number | null
  qty: number
  serving_size: string
}

export interface RecentItem {
  food_repo_id: string | null
  name: string
  carbs: number
  fat: number | null
  protein: number | null
  serving_size: string
}

interface Props {
  foodRepo: T1dFoodRepo[]
  recentItems: RecentItem[]
}

export function LunchBuilder({ foodRepo, recentItems }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('items')
  const [packed, setPacked] = useState<PackedItem[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [photoItems, setPhotoItems] = useState<PackedItem[] | null>(null)

  // Qty input state — which item is being configured
  const [adding, setAdding] = useState<{ food: T1dFoodRepo | RecentItem; qty: string } | null>(null)

  const photoRef = useRef<HTMLInputElement>(null)

  const isAlreadyPacked = (id: string | null, name: string) =>
    packed.some(p => (id && p.food_repo_id === id) || p.name === name)

  const openQtyInput = (food: T1dFoodRepo | RecentItem) => {
    setAdding({ food, qty: '1' })
  }

  const confirmAdd = () => {
    if (!adding) return
    const qty = parseFloat(adding.qty)
    if (!qty || qty <= 0) { setAdding(null); return }

    const f = adding.food
    const id = 'id' in f ? f.id : f.food_repo_id
    const carbs = 'carbs_g' in f ? f.carbs_g : f.carbs
    const fat = 'fat_g' in f ? (f.fat_g ?? null) : f.fat
    const protein = 'protein_g' in f ? (f.protein_g ?? null) : f.protein

    setPacked(prev => {
      const idx = prev.findIndex(p => (id && p.food_repo_id === id) || p.name === f.name)
      const item: PackedItem = { food_repo_id: id, name: f.name, carbs, fat, protein, qty, serving_size: f.serving_size }
      if (idx >= 0) return prev.map((p, i) => i === idx ? { ...p, qty } : p)
      return [...prev, item]
    })
    setAdding(null)
  }

  const updatePackedQty = (index: number, raw: string) => {
    const qty = parseFloat(raw)
    if (raw === '' || raw === '0') {
      setPacked(prev => prev.filter((_, i) => i !== index))
    } else if (!isNaN(qty) && qty > 0) {
      setPacked(prev => prev.map((p, i) => i === index ? { ...p, qty } : p))
    }
  }

  const removeItem = (index: number) => setPacked(prev => prev.filter((_, i) => i !== index))

  // Photo handling
  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAnalyzing(true)
    try {
      const form = new FormData()
      form.append('photo', file)
      const resp = await fetch('/api/t1d/carb-estimate', { method: 'POST', body: form })
      const data = await resp.json()
      const items: PackedItem[] = (data.items ?? []).map((item: {
        name: string; carbs: number; fat: number | null; protein: number | null;
        qty: number; matched_repo_id: string | null
      }) => ({
        food_repo_id: item.matched_repo_id ?? null,
        name: item.name,
        carbs: item.carbs,
        fat: item.fat ?? null,
        protein: item.protein ?? null,
        qty: item.qty ?? 1,
        serving_size: '1 serving',
      }))
      setPhotoItems(items)
    } finally {
      setAnalyzing(false)
    }
  }

  const addPhotoItems = () => {
    if (!photoItems) return
    setPacked(prev => {
      const next = [...prev]
      for (const item of photoItems) {
        if (!next.find(p => p.name.toLowerCase() === item.name.toLowerCase())) next.push(item)
      }
      return next
    })
    setPhotoItems(null)
    setTab('items')
  }

  const totalCarbs = packed.reduce((s, p) => s + p.carbs * p.qty, 0)

  const saveLunch = async () => {
    if (packed.length === 0) return
    setSaving(true)
    try {
      const items: MealItem[] = packed.map(p => ({
        food_repo_id: p.food_repo_id,
        name: p.name,
        qty_offered: p.qty,
        qty_eaten: null,
        carbs: p.carbs,
        fat: p.fat,
        protein: p.protein,
      }))
      await fetch('/api/t1d/meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: 'school_lunch', items, source: 'manual', entered_by: 'alexandra' }),
      })
      router.push('/lunch')
    } finally {
      setSaving(false)
    }
  }

  const filtered = search
    ? foodRepo.filter(f =>
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        (f.aliases ?? []).some(a => a.toLowerCase().includes(search.toLowerCase()))
      )
    : foodRepo

  // ── Qty input card ─────────────────────────────────────────────────────────
  if (adding) {
    const f = adding.food
    const carbs = 'carbs_g' in f ? f.carbs_g : f.carbs
    const preview = parseFloat(adding.qty) > 0 ? Math.round(carbs * parseFloat(adding.qty)) : 0
    return (
      <div className="space-y-4">
        <div className="bg-[#141414] rounded-2xl border border-teal-500/30 p-5 space-y-4">
          <div>
            <p className="text-[10px] tracking-widest text-teal-400 font-semibold">HOW MUCH?</p>
            <p className="text-base font-semibold text-white mt-1">{f.name}</p>
            <p className="text-xs text-gray-500">per {f.serving_size}</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              value={adding.qty}
              onChange={e => setAdding(a => a ? { ...a, qty: e.target.value } : null)}
              autoFocus
              className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-semibold text-center focus:outline-none focus:border-teal-500/50"
            />
            <div className="text-right w-20 flex-shrink-0">
              <p className="text-2xl font-bold text-teal-400 tabular-nums">{preview}g</p>
              <p className="text-[10px] text-gray-500">carbs</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setAdding(null)} className="flex-1 bg-white/5 border border-white/10 text-gray-400 text-sm font-semibold py-3 rounded-xl">
              Cancel
            </button>
            <button onClick={confirmAdd} className="flex-1 bg-teal-500 text-black font-bold py-3 rounded-xl">
              Add to Lunch
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main UI ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex w-full gap-1 bg-white/5 rounded-xl p-1">
        {(['items', 'photo'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-[11px] font-semibold py-2 rounded-lg transition-colors ${
              tab === t ? 'bg-white/10 text-white' : 'text-gray-500'
            }`}
          >
            {t === 'items' ? 'Add Items' : 'Take Photo'}
          </button>
        ))}
      </div>

      {/* ── Add Items tab ── */}
      {tab === 'items' && (
        <div className="space-y-3">
          {/* Recent items */}
          {recentItems.length > 0 && !search && (
            <div className="space-y-1.5">
              <p className="text-[10px] tracking-widest text-gray-500 font-semibold">RECENT</p>
              <div className="flex flex-wrap gap-2">
                {recentItems.map((item, i) => {
                  const packed_ = isAlreadyPacked(item.food_repo_id, item.name)
                  return (
                    <button
                      key={i}
                      onClick={() => openQtyInput(item)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                        packed_ ? 'bg-teal-500/20 border-teal-500/40 text-teal-300' : 'bg-[#141414] border-white/10 text-gray-300'
                      }`}
                    >
                      {item.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Search */}
          <input
            type="text"
            placeholder="Search all foods…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50"
          />

          {/* Food list */}
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {filtered.slice(0, 40).map(food => {
              const alreadyPacked = isAlreadyPacked(food.id, food.name)
              return (
                <div key={food.id} className="bg-[#141414] rounded-xl border border-white/5 px-4 py-2.5 flex items-center justify-between">
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="text-sm text-white truncate">{food.name}</p>
                    <p className="text-[10px] text-gray-500">{food.carbs_g}g · {food.serving_size}</p>
                  </div>
                  <button
                    onClick={() => openQtyInput(food)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-colors ${
                      alreadyPacked ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : 'bg-white/10 text-white'
                    }`}
                  >
                    {alreadyPacked ? 'Edit' : 'Add'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Photo tab ── */}
      {tab === 'photo' && (
        <div className="space-y-3">
          {!photoItems && !analyzing && (
            <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-12 text-center space-y-4">
              <p className="text-sm text-gray-400">Take a photo of the lunchbox</p>
              <p className="text-xs text-gray-600">Claude will identify the food and estimate carbs</p>
              <button onClick={() => photoRef.current?.click()} className="bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold px-6 py-3 rounded-xl">
                Open Camera
              </button>
              <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
            </div>
          )}

          {analyzing && (
            <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-12 text-center space-y-2">
              <p className="text-sm text-white">Analyzing photo…</p>
              <p className="text-xs text-gray-500">Claude is identifying food items</p>
            </div>
          )}

          {photoItems && (
            <div className="space-y-3">
              <p className="text-[10px] tracking-widest text-teal-400 font-semibold">FOUND IN PHOTO</p>
              {photoItems.map((item, i) => (
                <div key={i} className="bg-[#141414] rounded-xl border border-white/5 px-4 py-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm text-white">{item.name}</p>
                    <p className="text-xs text-gray-500">{Math.round(item.carbs * item.qty)}g carbs</p>
                  </div>
                  <span className="text-xs text-gray-400">×{item.qty}</span>
                </div>
              ))}
              <div className="flex gap-3">
                <button onClick={() => { setPhotoItems(null); if (photoRef.current) photoRef.current.value = '' }} className="flex-1 bg-white/5 border border-white/10 text-gray-400 text-sm py-3 rounded-xl">Retake</button>
                <button onClick={addPhotoItems} className="flex-1 bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold py-3 rounded-xl">Add to Lunch →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Packed items ── */}
      {packed.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] tracking-widest text-gray-500 font-semibold">PACKED</p>
          {packed.map((item, i) => (
            <div key={i} className="bg-[#141414] rounded-xl border border-white/5 px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{item.name}</p>
                <p className="text-[10px] text-gray-500">{item.serving_size}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  value={item.qty}
                  onChange={e => updatePackedQty(i, e.target.value)}
                  className="w-14 bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:border-teal-500/50"
                />
                <p className="text-xs text-teal-400 w-12 text-right tabular-nums flex-shrink-0">{Math.round(item.carbs * item.qty)}g</p>
                <button onClick={() => removeItem(i)} className="text-gray-600 hover:text-red-400 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          <div className="px-4 py-1 flex justify-between">
            <span className="text-xs text-gray-600">Total</span>
            <span className="text-sm font-bold text-white">{Math.round(totalCarbs)}g</span>
          </div>
        </div>
      )}

      {/* ── Save ── */}
      <button
        onClick={saveLunch}
        disabled={packed.length === 0 || saving}
        className="w-full bg-teal-500 text-black font-bold py-4 rounded-2xl disabled:opacity-30 active:opacity-80"
      >
        {saving ? 'Saving…' : packed.length > 0 ? `Save Lunch · ${Math.round(totalCarbs)}g` : 'Add items to save'}
      </button>
    </div>
  )
}
