'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { T1dFoodRepo } from '@/types/health'

const CATEGORIES = ['all', 'snack', 'bread', 'sweets', 'drink', 'meal', 'fruit', 'sides', 'vegetable', 'dairy', 'protein'] as const

function FoodRow({
  food,
  onSave,
  onDelete,
}: {
  food: T1dFoodRepo
  onSave: (f: T1dFoodRepo) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(food)
  const [saving, setSaving] = useState(false)

  if (!editing) {
    return (
      <div className="bg-[#141414] rounded-xl border border-white/5 px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white truncate">{food.name}</p>
            {food.gi_category && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 font-semibold ${
                food.gi_category === 'high' ? 'text-orange-400 bg-orange-500/10' :
                food.gi_category === 'medium' ? 'text-yellow-400 bg-yellow-500/10' :
                'text-green-400 bg-green-500/10'
              }`}>{food.gi_category} GI</span>
            )}
            {food.notes && (
              <span className="text-[9px] text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded flex-shrink-0">note</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {food.serving_size} · {food.category}
            {food.aliases?.length ? ` · aka: ${food.aliases.slice(0, 2).join(', ')}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right">
            <p className="text-sm font-bold text-teal-400">{food.carbs_g}g</p>
            <p className="text-[10px] text-gray-600">carbs</p>
          </div>
          <button onClick={() => setEditing(true)} className="text-gray-600 hover:text-gray-400">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  const save = async () => {
    setSaving(true)
    const res = await fetch(`/api/t1d/food-repo/${food.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: draft.name,
        serving_size: draft.serving_size,
        carbs_g: draft.carbs_g,
        fat_g: draft.fat_g,
        protein_g: draft.protein_g,
        calories: draft.calories,
        category: draft.category,
        gi_category: draft.gi_category,
        notes: draft.notes,
        aliases: draft.aliases,
      }),
    })
    const updated = await res.json()
    onSave(updated)
    setEditing(false)
    setSaving(false)
  }

  return (
    <div className="bg-[#141414] rounded-xl border border-teal-500/20 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-[10px] text-gray-500 font-semibold">NAME</label>
          <input
            value={draft.name}
            onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
            className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 font-semibold">SERVING SIZE</label>
          <input
            value={draft.serving_size}
            onChange={e => setDraft(p => ({ ...p, serving_size: e.target.value }))}
            className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 font-semibold">CATEGORY</label>
          <select
            value={draft.category ?? ''}
            onChange={e => setDraft(p => ({ ...p, category: e.target.value }))}
            className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none"
          >
            {['snack', 'bread', 'sweets', 'drink', 'meal', 'fruit', 'sides', 'vegetable', 'dairy', 'protein'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 font-semibold">GLYCEMIC INDEX</label>
          <select
            value={draft.gi_category ?? ''}
            onChange={e => setDraft(p => ({ ...p, gi_category: (e.target.value || null) as 'high' | 'medium' | 'low' | null }))}
            className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none"
          >
            <option value="">unknown</option>
            <option value="high">high (potato, white rice, bread)</option>
            <option value="medium">medium (pasta, banana, oats)</option>
            <option value="low">low (protein, fat, most veg)</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 font-semibold">CARBS (g)</label>
          <input
            type="number"
            value={draft.carbs_g}
            onChange={e => setDraft(p => ({ ...p, carbs_g: parseFloat(e.target.value) }))}
            className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 font-semibold">FAT (g)</label>
          <input
            type="number"
            value={draft.fat_g ?? ''}
            onChange={e => setDraft(p => ({ ...p, fat_g: e.target.value ? parseFloat(e.target.value) : null }))}
            className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 font-semibold">PROTEIN (g)</label>
          <input
            type="number"
            value={draft.protein_g ?? ''}
            onChange={e => setDraft(p => ({ ...p, protein_g: e.target.value ? parseFloat(e.target.value) : null }))}
            className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none"
          />
        </div>
        <div className="col-span-2">
          <label className="text-[10px] text-gray-500 font-semibold">NOTES (optional — behavior flags)</label>
          <input
            value={draft.notes ?? ''}
            onChange={e => setDraft(p => ({ ...p, notes: e.target.value || null }))}
            placeholder="e.g. causes delayed spike, use for lows only"
            className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none"
          />
        </div>
        <div className="col-span-2">
          <label className="text-[10px] text-gray-500 font-semibold">ALIASES (comma-separated)</label>
          <input
            value={(draft.aliases ?? []).join(', ')}
            onChange={e => setDraft(p => ({
              ...p,
              aliases: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
            }))}
            placeholder="e.g. nacho chips, tortilla chips"
            className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold py-2 rounded-lg"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={() => { setDraft(food); setEditing(false) }}
          className="px-4 bg-white/5 border border-white/10 text-gray-400 text-sm font-semibold py-2 rounded-lg"
        >
          Cancel
        </button>
        <button
          onClick={() => onDelete(food.id)}
          className="px-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm py-2 rounded-lg"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function AddFoodForm({ onAdded }: { onAdded: (f: T1dFoodRepo) => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', serving_size: '1 serving', carbs_g: '', fat_g: '', protein_g: '', category: 'snack', gi_category: '', notes: '', aliases: '' })
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full border border-dashed border-white/10 rounded-xl py-3 text-xs text-gray-500 font-semibold"
      >
        + Add food
      </button>
    )
  }

  const save = async () => {
    if (!form.name || !form.carbs_g) return
    setSaving(true)
    const res = await fetch('/api/t1d/food-repo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        serving_size: form.serving_size,
        serving_qty: 1,
        carbs_g: parseFloat(form.carbs_g),
        fat_g: form.fat_g ? parseFloat(form.fat_g) : null,
        protein_g: form.protein_g ? parseFloat(form.protein_g) : null,
        category: form.category,
        gi_category: form.gi_category || null,
        notes: form.notes || null,
        aliases: form.aliases.split(',').map(s => s.trim()).filter(Boolean),
      }),
    })
    const added = await res.json()
    onAdded(added)
    setForm({ name: '', serving_size: '1 serving', carbs_g: '', fat_g: '', protein_g: '', category: 'snack', gi_category: '', notes: '', aliases: '' })
    setOpen(false)
    setSaving(false)
  }

  return (
    <div className="bg-[#141414] rounded-xl border border-teal-500/20 p-4 space-y-3">
      <p className="text-[10px] tracking-widest text-teal-400 font-semibold">NEW FOOD</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-[10px] text-gray-500 font-semibold">NAME</label>
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Nature Valley Bar" className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 font-semibold">SERVING SIZE</label>
          <input value={form.serving_size} onChange={e => setForm(p => ({ ...p, serving_size: e.target.value }))} className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 font-semibold">CATEGORY</label>
          <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none">
            {['snack', 'bread', 'sweets', 'drink', 'meal', 'fruit', 'sides', 'vegetable', 'dairy', 'protein'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 font-semibold">GLYCEMIC INDEX</label>
          <select value={form.gi_category} onChange={e => setForm(p => ({ ...p, gi_category: e.target.value }))} className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none">
            <option value="">unknown</option>
            <option value="high">high (potato, white rice, bread)</option>
            <option value="medium">medium (pasta, banana, oats)</option>
            <option value="low">low (protein, fat, most veg)</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 font-semibold">CARBS (g) *</label>
          <input type="number" value={form.carbs_g} onChange={e => setForm(p => ({ ...p, carbs_g: e.target.value }))} className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 font-semibold">FAT (g)</label>
          <input type="number" value={form.fat_g} onChange={e => setForm(p => ({ ...p, fat_g: e.target.value }))} className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none" />
        </div>
        <div className="col-span-2">
          <label className="text-[10px] text-gray-500 font-semibold">NOTES</label>
          <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="e.g. causes delayed spike" className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !form.name || !form.carbs_g} className="flex-1 bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold py-2 rounded-lg disabled:opacity-40">
          {saving ? 'Adding...' : 'Add food'}
        </button>
        <button onClick={() => setOpen(false)} className="px-4 bg-white/5 border border-white/10 text-gray-400 text-sm py-2 rounded-lg">Cancel</button>
      </div>
    </div>
  )
}

export default function FoodsPage() {
  const router = useRouter()
  const [foods, setFoods] = useState<T1dFoodRepo[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/t1d/food-repo').then(r => r.json()).then(data => {
      setFoods(data)
      setLoading(false)
    })
  }, [])

  const filtered = foods.filter(f => {
    const matchCat = category === 'all' || f.category === category
    const matchSearch = !search || f.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const handleSave = (updated: T1dFoodRepo) => {
    setFoods(prev => prev.map(f => f.id === updated.id ? updated : f))
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/t1d/food-repo/${id}`, { method: 'DELETE' })
    setFoods(prev => prev.filter(f => f.id !== id))
  }

  const handleAdd = (f: T1dFoodRepo) => {
    setFoods(prev => [f, ...prev])
  }

  return (
    <div className="px-4 pt-5 pb-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <p className="text-[10px] tracking-widest text-gray-500 font-semibold">FOOD REPO</p>
          <p className="text-lg font-semibold text-white">{foods.length} foods</p>
        </div>
      </div>

      {/* Recipes link */}
      <a href="/engine/recipes">
        <div className="bg-[#141414] rounded-xl border border-teal-500/20 px-4 py-3 flex items-center justify-between active:opacity-70">
          <div>
            <p className="text-sm font-semibold text-white">Saved Recipes</p>
            <p className="text-xs text-gray-500 mt-0.5">Homemade foods with carb counts</p>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </a>

      {/* Search */}
      <div className="flex items-center gap-3 bg-[#141414] border border-white/10 rounded-xl px-4 py-2.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search foods..."
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
        />
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              category === c
                ? 'border-teal-500/40 bg-teal-500/10 text-teal-300'
                : 'border-white/10 bg-white/5 text-gray-500'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-600 text-sm text-center py-4">Loading...</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(food => (
            <FoodRow key={food.id} food={food} onSave={handleSave} onDelete={handleDelete} />
          ))}
          {filtered.length === 0 && (
            <p className="text-gray-600 text-sm text-center py-4">No foods match</p>
          )}
          <AddFoodForm onAdded={handleAdd} />
        </div>
      )}
    </div>
  )
}
