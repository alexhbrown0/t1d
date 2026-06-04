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

export function LunchBuilder({ foodRepo }: { foodRepo: T1dFoodRepo[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('items')
  const [packed, setPacked] = useState<PackedItem[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [photoItems, setPhotoItems] = useState<PackedItem[] | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  const filtered = foodRepo.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.aliases ?? []).some(a => a.toLowerCase().includes(search.toLowerCase()))
  )

  const addItem = (food: T1dFoodRepo) => {
    setPacked(prev => {
      const idx = prev.findIndex(p => p.food_repo_id === food.id)
      if (idx >= 0) {
        return prev.map((p, i) => i === idx ? { ...p, qty: p.qty + 1 } : p)
      }
      return [...prev, {
        food_repo_id: food.id,
        name: food.name,
        carbs: food.carbs_g,
        fat: food.fat_g ?? null,
        protein: food.protein_g ?? null,
        qty: 1,
        serving_size: food.serving_size,
      }]
    })
  }

  const updateQty = (index: number, qty: number) => {
    if (qty <= 0) {
      setPacked(prev => prev.filter((_, i) => i !== index))
    } else {
      setPacked(prev => prev.map((p, i) => i === index ? { ...p, qty } : p))
    }
  }

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
        const exists = next.find(p => p.name.toLowerCase() === item.name.toLowerCase())
        if (!exists) next.push(item)
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
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Search foods…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50"
          />
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {filtered.slice(0, 40).map(food => {
              const inPacked = packed.find(p => p.food_repo_id === food.id)
              return (
                <div key={food.id} className="bg-[#141414] rounded-xl border border-white/5 px-4 py-2.5 flex items-center justify-between">
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="text-sm text-white truncate">{food.name}</p>
                    <p className="text-[10px] text-gray-500">{food.carbs_g}g · {food.serving_size}</p>
                  </div>
                  <button
                    onClick={() => addItem(food)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors ${
                      inPacked ? 'bg-teal-500 text-black' : 'bg-white/10 text-white'
                    }`}
                  >
                    {inPacked ? inPacked.qty : '+'}
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
              <button
                onClick={() => photoRef.current?.click()}
                className="bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold px-6 py-3 rounded-xl"
              >
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
                <button
                  onClick={() => { setPhotoItems(null); photoRef.current && (photoRef.current.value = '') }}
                  className="flex-1 bg-white/5 border border-white/10 text-gray-400 text-sm py-3 rounded-xl"
                >
                  Retake
                </button>
                <button
                  onClick={addPhotoItems}
                  className="flex-1 bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold py-3 rounded-xl"
                >
                  Add to Lunch →
                </button>
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
                <p className="text-xs text-gray-500">{Math.round(item.carbs * item.qty)}g carbs</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => updateQty(i, item.qty - 1)} className="w-7 h-7 rounded-lg bg-white/5 text-white flex items-center justify-center text-base leading-none">−</button>
                <span className="text-sm text-white w-5 text-center">{item.qty}</span>
                <button onClick={() => updateQty(i, item.qty + 1)} className="w-7 h-7 rounded-lg bg-white/5 text-white flex items-center justify-center text-base leading-none">+</button>
              </div>
            </div>
          ))}
          <div className="px-4 py-1 flex justify-between">
            <span className="text-xs text-gray-600">Total</span>
            <span className="text-sm font-bold text-white">{Math.round(totalCarbs)}g</span>
          </div>
        </div>
      )}

      {/* ── Save button ── */}
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
