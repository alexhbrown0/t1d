'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { T1dFoodRepo, PackedSnack } from '@/types/health'
import type { RecentItem } from '@/components/t1d/lunch-builder'

const TARGET = 5

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

type Tab = 'search' | 'recent' | 'photo'

export function SnackPacker({
  foodRepo,
  initialPacked,
  recentItems,
}: {
  foodRepo: T1dFoodRepo[]
  initialPacked: PackedSnack[]
  recentItems: RecentItem[]
}) {
  const router = useRouter()
  const [packed, setPacked] = useState<PackedSnack[]>(initialPacked)
  const [tab, setTab] = useState<Tab>(recentItems.length > 0 ? 'recent' : 'search')
  const [search, setSearch] = useState('')
  const [manual, setManual] = useState<{ name: string; carbs: string } | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoNote, setPhotoNote] = useState('')
  const photoRef = useRef<HTMLInputElement>(null)

  const key = (i: { food_repo_id: string | null; name: string }) => i.food_repo_id ?? i.name.toLowerCase()

  // Adding the same snack again bumps its quantity instead of a duplicate row.
  const add = (item: RecentItem) => {
    setPacked(prev => {
      const idx = prev.findIndex(p => key(p) === key(item))
      if (idx >= 0) return prev.map((p, i) => i === idx ? { ...p, qty: p.qty + 1 } : p)
      return [...prev, { ...item, qty: 1 }]
    })
  }

  const setQty = (i: number, delta: number) => {
    setPacked(prev => prev.map((p, j) => j === i ? { ...p, qty: Math.max(1, p.qty + delta) } : p))
  }

  const addRepo = (f: T1dFoodRepo) => add({
    food_repo_id: f.id, name: f.name, carbs: f.carbs_g,
    fat: f.fat_g ?? null, protein: f.protein_g ?? null, serving_size: f.serving_size,
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
      if (photoNote.trim()) form.append('hint', photoNote.trim())
      const resp = await fetch('/api/t1d/carb-estimate', { method: 'POST', body: form })
      const data = await resp.json()
      if (!resp.ok || data.ai_unavailable) {
        setError(data.error ?? 'Photo analysis failed. Add manually instead.')
        setManual({ name: '', carbs: '' })
        return
      }
      const items = (data.items ?? []) as Array<{ name: string; carbs: number; fat: number | null; protein: number | null; qty: number; matched_repo_id: string | null }>
      for (const it of items) {
        add({
          food_repo_id: it.matched_repo_id ?? null,
          name: it.name,
          carbs: Math.round(it.carbs * (it.qty ?? 1)),
          fat: it.fat ?? null,
          protein: it.protein ?? null,
          serving_size: '1 serving',
        })
      }
    } finally {
      setAnalyzing(false)
    }
  }

  const useManual = () => {
    if (!manual || !manual.carbs) return
    add({
      food_repo_id: null,
      name: manual.name.trim() || 'Snack',
      carbs: parseFloat(manual.carbs) || 0,
      fat: null, protein: null, serving_size: '1 serving',
    })
    setManual(null)
  }

  const save = async () => {
    if (packed.length === 0) return
    setSaving(true)
    try {
      await fetch('/api/t1d/packed-snacks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: packed.map(p => ({
            food_repo_id: p.food_repo_id,
            name: p.name,
            carbs_g: p.carbs,
            fat_g: p.fat,
            protein_g: p.protein,
            serving_size: p.serving_size || '1 serving',
            qty: p.qty,
          })),
        }),
      })
      router.push('/snack')
    } finally {
      setSaving(false)
    }
  }

  const results = search.trim()
    ? foodRepo.filter(f =>
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        (f.aliases ?? []).some(a => a.toLowerCase().includes(search.toLowerCase()))
      ).slice(0, 20)
    : []

  return (
    <div className="space-y-4">
      {/* Packed list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] tracking-widest text-teal-400 font-semibold">
            THIS WEEK&apos;S SNACKS · {packed.length} of ~{TARGET}
          </p>
          {packed.length > 6 && <span className="text-[10px] text-amber-400">that&apos;s a lot — {packed.length}</span>}
        </div>
        {packed.length === 0 && (
          <p className="text-xs text-gray-600">Add ~5 snacks Brooks will take this week.</p>
        )}
        {packed.map((item, i) => (
          <div key={i} className="bg-[#141414] rounded-xl border border-white/5 px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{item.name}</p>
              <p className="text-[10px] text-gray-500">{item.carbs}g each{item.qty > 1 ? ` · ${Math.round(item.carbs * item.qty)}g total` : ''}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => setQty(i, -1)} className="w-6 h-6 rounded-md bg-white/5 text-white text-base font-bold flex items-center justify-center">−</button>
              <span className="text-white text-sm font-semibold w-4 text-center tabular-nums">{item.qty}</span>
              <button onClick={() => setQty(i, 1)} className="w-6 h-6 rounded-md bg-white/5 text-white text-base font-bold flex items-center justify-center">+</button>
            </div>
            <button onClick={() => setPacked(prev => prev.filter((_, j) => j !== i))} className="text-gray-600 active:text-red-400 flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {packed.length > 0 && (
        <button onClick={save} disabled={saving}
          className="w-full bg-teal-500 text-black font-bold py-4 rounded-2xl active:opacity-80 disabled:opacity-50">
          {saving ? <span className="flex items-center justify-center gap-2"><Spinner /> Saving…</span> : `Save ${packed.length} Snack${packed.length === 1 ? '' : 's'} for the Week`}
        </button>
      )}

      {/* Add methods */}
      {error && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-300">{error}</p>
        </div>
      )}

      {manual ? (
        <div className="bg-[#141414] rounded-2xl border border-white/5 p-4 space-y-3">
          <p className="text-[10px] tracking-widest text-gray-500 font-semibold">ADD MANUALLY</p>
          <input type="text" value={manual.name} onChange={e => setManual({ ...manual, name: e.target.value })}
            placeholder="Snack name"
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50" />
          <div className="flex items-baseline gap-2">
            <input type="number" inputMode="numeric" value={manual.carbs} onChange={e => setManual({ ...manual, carbs: e.target.value })}
              placeholder="0" className="w-24 text-3xl font-bold text-white bg-transparent outline-none" autoFocus />
            <span className="text-gray-500">grams carbs</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setManual(null)} className="flex-1 bg-white/5 border border-white/10 text-gray-400 text-sm py-3 rounded-xl">Cancel</button>
            <button onClick={useManual} disabled={!manual.carbs} className="flex-1 bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold py-3 rounded-xl disabled:opacity-40">Add</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex w-full gap-1 bg-white/5 rounded-xl p-1">
            {(['recent', 'search', 'photo'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 text-[11px] font-semibold py-2 rounded-lg capitalize ${tab === t ? 'bg-white/10 text-white' : 'text-gray-500'}`}>
                {t}
              </button>
            ))}
          </div>

          {tab === 'recent' && (
            <div className="space-y-2">
              {recentItems.length === 0 && <p className="text-xs text-gray-600 text-center py-6">No recent snacks — search or take a photo.</p>}
              {recentItems.map((r, i) => (
                <button key={i} onClick={() => add(r)}
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
                <button key={f.id} onClick={() => addRepo(f)}
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
                  <p className="text-sm text-gray-400">Take a photo of the snacks</p>
                  <input
                    type="text" value={photoNote} onChange={e => setPhotoNote(e.target.value)}
                    placeholder="Add a note first (e.g. Goldfish, big bag)"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50"
                  />
                  <button onClick={() => photoRef.current?.click()} className="bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold px-6 py-3 rounded-xl">Open Camera</button>
                  <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
                </>
              )}
            </div>
          )}

          <button onClick={() => setManual({ name: '', carbs: '' })} className="w-full text-xs text-gray-500 py-2 active:text-gray-300">
            Add manually
          </button>
        </>
      )}
    </div>
  )
}
