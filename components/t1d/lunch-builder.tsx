'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { T1dFoodRepo, MealItem } from '@/types/health'

type Tab = 'items' | 'photo'

export interface PackedItem {
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

export interface ItemStat {
  daysAgo: number
  timesServed: number
}

export interface LunchRecipe {
  id: string
  name: string
  carbs_per_piece: number | null
  fat_per_piece: number | null
  protein_per_piece: number | null
  yield_unit: string | null
  carbs_per_100g: number | null
  fat_per_100g: number | null
  protein_per_100g: number | null
  typical_serving_g: number | null
  typical_serving_description: string | null
}

function recipeAsItem(r: LunchRecipe): RecentItem | null {
  if (r.carbs_per_piece != null) {
    return {
      food_repo_id: null,
      name: r.name,
      carbs: r.carbs_per_piece,
      fat: r.fat_per_piece ?? null,
      protein: r.protein_per_piece ?? null,
      serving_size: `1 ${r.yield_unit?.replace(/s$/, '') ?? 'piece'}`,
    }
  }
  if (r.carbs_per_100g != null && r.typical_serving_g != null) {
    const factor = r.typical_serving_g / 100
    return {
      food_repo_id: null,
      name: r.name,
      carbs: Math.round(r.carbs_per_100g * factor * 10) / 10,
      fat: r.fat_per_100g != null ? Math.round(r.fat_per_100g * factor * 10) / 10 : null,
      protein: r.protein_per_100g != null ? Math.round(r.protein_per_100g * factor * 10) / 10 : null,
      serving_size: r.typical_serving_description ?? `${r.typical_serving_g}g`,
    }
  }
  return null
}

interface Props {
  foodRepo: T1dFoodRepo[]
  recentItems: RecentItem[]
  itemStats: Record<string, ItemStat>
  initialPacked: PackedItem[]
  existingMealId: string | null
  saveTimestamp: string
  recipes?: LunchRecipe[]
}

export function LunchBuilder({ foodRepo, recentItems, itemStats, initialPacked, existingMealId, saveTimestamp, recipes = [] }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('items')
  const [packed, setPacked] = useState<PackedItem[]>(initialPacked)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [photoItems, setPhotoItems] = useState<PackedItem[] | null>(null)
  const [adding, setAdding] = useState<{ food: T1dFoodRepo | RecentItem; qty: string } | null>(null)
  const [editingPhotoIdx, setEditingPhotoIdx] = useState<number | null>(null)
  const [editingPhotoQty, setEditingPhotoQty] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [chatReply, setChatReply] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  const statKey = (id: string | null, name: string) => id ?? name
  const isAlreadyPacked = (id: string | null, name: string) =>
    packed.some(p => (id && p.food_repo_id === id) || p.name === name)

  const openQtyInput = (food: T1dFoodRepo | RecentItem) => {
    const id = 'id' in food ? food.id : food.food_repo_id
    const existingPacked = packed.find(p => (id && p.food_repo_id === id) || p.name === food.name)
    setAdding({ food, qty: existingPacked ? String(existingPacked.qty) : '1' })
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
    if (raw === '' || (!isNaN(qty) && qty <= 0)) {
      setPacked(prev => prev.filter((_, i) => i !== index))
    } else if (!isNaN(qty) && qty > 0) {
      setPacked(prev => prev.map((p, i) => i === index ? { ...p, qty } : p))
    }
  }

  const removeItem = (index: number) => setPacked(prev => prev.filter((_, i) => i !== index))

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

  const sendChat = async () => {
    if (!chatInput.trim() || !photoItems) return
    setChatLoading(true)
    const msg = chatInput.trim()
    setChatInput('')
    try {
      const resp = await fetch('/api/t1d/lunch/refine-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: photoItems, message: msg }),
      })
      const data = await resp.json()
      if (data.items) setPhotoItems(data.items)
      if (data.reply) setChatReply(data.reply)
    } finally {
      setChatLoading(false)
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

      if (existingMealId) {
        await fetch(`/api/t1d/meal/${existingMealId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items_offered: items, entered_by: 'alexandra' }),
        })
      } else {
        await fetch('/api/t1d/meal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: 'school_lunch',
            items,
            source: 'manual',
            entered_by: 'alexandra',
            timestamp: saveTimestamp,
          }),
        })
      }
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

  const filteredRecipes = search
    ? recipes.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : []

  // ── Qty input screen ────────────────────────────────────────────────────────
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

  // ── Main UI ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
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
          {recentItems.length > 0 && !search && (
            <div className="space-y-1.5">
              <p className="text-[10px] tracking-widest text-gray-500 font-semibold">RECENT</p>
              <div className="flex flex-wrap gap-2">
                {recentItems.map((item, i) => {
                  const key = statKey(item.food_repo_id, item.name)
                  const stat = itemStats[key]
                  const alreadyPacked = isAlreadyPacked(item.food_repo_id, item.name)
                  return (
                    <button
                      key={i}
                      onClick={() => openQtyInput(item)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors text-left ${
                        alreadyPacked
                          ? 'bg-teal-500/20 border-teal-500/40 text-teal-300'
                          : 'bg-[#141414] border-white/10 text-gray-300'
                      }`}
                    >
                      {item.name}
                      {stat && (
                        <span className="text-gray-600 font-normal ml-1.5">
                          {stat.daysAgo === 0 ? 'today' : stat.daysAgo === 1 ? 'yesterday' : `${stat.daysAgo}d`}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {recipes.length > 0 && !search && (
            <div className="space-y-1.5">
              <p className="text-[10px] tracking-widest text-gray-500 font-semibold">RECIPES</p>
              <div className="flex flex-wrap gap-2">
                {recipes.map(r => {
                  const item = recipeAsItem(r)
                  if (!item) return null
                  const alreadyPacked = isAlreadyPacked(null, r.name)
                  return (
                    <button
                      key={r.id}
                      onClick={() => openQtyInput(item)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                        alreadyPacked
                          ? 'bg-teal-500/20 border-teal-500/40 text-teal-300'
                          : 'bg-[#141414] border-teal-500/20 text-gray-300'
                      }`}
                    >
                      {r.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <input
            type="text"
            placeholder="Search all foods…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50"
          />

          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {filteredRecipes.map(r => {
              const item = recipeAsItem(r)
              if (!item) return null
              const alreadyPacked = isAlreadyPacked(null, r.name)
              return (
                <div key={r.id} className="bg-[#141414] rounded-xl border border-teal-500/10 px-4 py-2.5 flex items-center justify-between">
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-white truncate">{r.name}</p>
                      <span className="text-[9px] text-teal-500 bg-teal-500/10 px-1.5 py-0.5 rounded flex-shrink-0">recipe</span>
                    </div>
                    <p className="text-[10px] text-gray-500">{item.carbs}g · {item.serving_size}</p>
                  </div>
                  <button
                    onClick={() => openQtyInput(item)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-colors ${
                      alreadyPacked ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : 'bg-white/10 text-white'
                    }`}
                  >
                    {alreadyPacked ? 'Edit' : 'Add'}
                  </button>
                </div>
              )
            })}
            {filtered.slice(0, 40).map(food => {
              const key = statKey(food.id, food.name)
              const stat = itemStats[key]
              const alreadyPacked = isAlreadyPacked(food.id, food.name)
              return (
                <div key={food.id} className="bg-[#141414] rounded-xl border border-white/5 px-4 py-2.5 flex items-center justify-between">
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="text-sm text-white truncate">{food.name}</p>
                    <p className="text-[10px] text-gray-500">
                      {food.carbs_g}g · {food.serving_size}
                      {stat && <span className="text-gray-600 ml-2">last {stat.daysAgo === 0 ? 'today' : stat.daysAgo === 1 ? 'yesterday' : `${stat.daysAgo}d ago`}</span>}
                    </p>
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
                <div key={i}>
                  <div
                    className="bg-[#141414] rounded-xl border border-white/5 px-4 py-3 flex justify-between items-center cursor-pointer active:opacity-70"
                    onClick={() => {
                      if (editingPhotoIdx === i) { setEditingPhotoIdx(null) }
                      else { setEditingPhotoIdx(i); setEditingPhotoQty(String(item.qty)) }
                    }}
                  >
                    <div>
                      <p className="text-sm text-white">{item.name}</p>
                      <p className="text-xs text-gray-500">{Math.round(item.carbs * item.qty)}g carbs</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 tabular-nums">×{item.qty}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </div>
                  </div>

                  {editingPhotoIdx === i && (
                    <div className="mt-1 bg-[#1a1a1a] rounded-xl border border-white/10 px-4 py-3 flex items-center gap-3">
                      <p className="text-xs text-gray-400 flex-1">{item.serving_size}</p>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        value={editingPhotoQty}
                        onChange={e => setEditingPhotoQty(e.target.value)}
                        autoFocus
                        className="w-16 bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:border-teal-500/50"
                      />
                      <button
                        onClick={() => {
                          const qty = parseFloat(editingPhotoQty)
                          if (qty > 0) setPhotoItems(p => p?.map((it, j) => j === i ? { ...it, qty } : it) ?? p)
                          setEditingPhotoIdx(null)
                        }}
                        className="bg-teal-500 text-black text-xs font-bold px-3 py-1.5 rounded-lg"
                      >
                        Done
                      </button>
                      <button
                        onClick={() => { setPhotoItems(p => p?.filter((_, j) => j !== i) ?? p); setEditingPhotoIdx(null) }}
                        className="text-gray-600 active:text-red-400"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Inline chat for corrections */}
              <div className="space-y-2">
                {chatReply && (
                  <div className="bg-teal-500/5 border border-teal-500/20 rounded-xl px-3 py-2">
                    <p className="text-xs text-teal-300 leading-relaxed">{chatReply}</p>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !chatLoading) sendChat() }}
                    placeholder="e.g. that's 2 sandwiches, not 1"
                    className="flex-1 min-w-0 bg-[#141414] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-500/40"
                  />
                  <button
                    onClick={sendChat}
                    disabled={!chatInput.trim() || chatLoading}
                    className="bg-white/10 text-white text-xs font-semibold px-3 py-2.5 rounded-xl disabled:opacity-40 flex-shrink-0"
                  >
                    {chatLoading ? '…' : 'Send'}
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setPhotoItems(null); setChatReply(''); if (photoRef.current) photoRef.current.value = '' }} className="flex-1 bg-white/5 border border-white/10 text-gray-400 text-sm py-3 rounded-xl">Retake</button>
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
                <button onClick={() => removeItem(i)} className="text-gray-600 active:text-red-400 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          <div className="px-4 py-1 flex justify-between">
            <span className="text-xs text-gray-600">Total</span>
            <span className="text-sm font-bold text-white tabular-nums">{Math.round(totalCarbs)}g</span>
          </div>
        </div>
      )}

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
