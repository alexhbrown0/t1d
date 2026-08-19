'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { logEvent } from '@/lib/t1d/device'
import type { T1dCafeteriaMenuItem } from '@/types/health'

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
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(menu.filter(m => initialSelectedNames.includes(m.name)).map(m => m.id))
  )
  const [saving, setSaving] = useState(false)
  const [staplesOpen, setStaplesOpen] = useState(false)

  const stapleSet = new Set(stapleNames)
  const featured = menu.filter(m => !stapleSet.has(m.name))
  const staples = menu.filter(m => stapleSet.has(m.name))

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const grouped = CATEGORY_ORDER.map(cat => ({
    cat,
    items: featured.filter(m => (m.category ?? 'other') === cat),
  })).filter(g => g.items.length > 0)

  const chosen = menu.filter(m => selected.has(m.id))
  const totalCarbs = Math.round(chosen.reduce((s, m) => s + Number(m.carbs_g), 0))

  const save = async () => {
    if (chosen.length === 0) return
    setSaving(true)
    try {
      const items = chosen.map(m => ({
        food_repo_id: null,
        name: m.name,
        qty_offered: 1,
        qty_eaten: null,
        carbs: Number(m.carbs_g),
        fat: null,
        protein: null,
      }))
      if (existingMealId) {
        await fetch(`/api/t1d/meal/${existingMealId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items_offered: items, is_cafeteria: true, entered_by: 'alexandra' }),
        })
      } else {
        await fetch('/api/t1d/meal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: 'school_lunch', is_cafeteria: true, source: 'photo', items, entered_by: 'alexandra', timestamp: saveTimestamp }),
        })
      }
      await logEvent('meal', `Cafeteria lunch loaded · ${totalCarbs}g`)
      if (onSaved) onSaved()
      else router.push('/lunch')
    } finally {
      setSaving(false)
    }
  }

  if (menu.length === 0) {
    return (
      <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-8 text-center space-y-3">
        <p className="text-sm text-gray-400">No cafeteria menu loaded for {targetLabel.toLowerCase()}.</p>
        <Link href="/engine/menu" className="inline-block text-xs font-semibold text-teal-400">Upload the month&apos;s menu →</Link>
      </div>
    )
  }

  const itemButton = (m: T1dCafeteriaMenuItem) => {
    const on = selected.has(m.id)
    return (
      <button key={m.id} onClick={() => toggle(m.id)}
        className={`w-full rounded-xl border px-4 py-3 flex items-center gap-3 text-left active:opacity-80 ${
          on ? 'bg-teal-500/10 border-teal-500/40' : 'bg-[#141414] border-white/5'
        }`}>
        <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${on ? 'border-teal-500 bg-teal-500' : 'border-gray-600'}`}>
          {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
        </div>
        <span className="text-sm text-white flex-1 min-w-0">{m.name}</span>
        <span className="text-xs text-teal-400 flex-shrink-0">{Math.round(Number(m.carbs_g))}g</span>
      </button>
    )
  }

  const stapleSelectedCount = staples.filter(m => selected.has(m.id)).length

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">Pick what Brooks will get from the cafeteria. Portions get set from a tray photo before he eats.</p>

      {/* Always available — persistent staples, collapsed by default */}
      {staples.length > 0 && (
        <div className="space-y-2">
          <button onClick={() => setStaplesOpen(o => !o)}
            className="w-full flex items-center justify-between px-1 py-1">
            <span className="text-[10px] tracking-widest text-gray-500 font-semibold">
              ALWAYS AVAILABLE{stapleSelectedCount > 0 ? ` · ${stapleSelectedCount} SELECTED` : ''}
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"
              className={`transition-transform ${staplesOpen ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {staplesOpen && <div className="space-y-2">{staples.map(itemButton)}</div>}
        </div>
      )}

      {/* Today's featured menu */}
      <div className="space-y-4">
        <p className="text-[10px] tracking-widest text-teal-400 font-semibold">TODAY&apos;S MENU</p>
        {grouped.map(({ cat, items }) => (
          <div key={cat} className="space-y-2">
            <p className="text-[10px] tracking-widest text-gray-600 font-semibold">{CATEGORY_LABEL[cat]}</p>
            {items.map(itemButton)}
          </div>
        ))}
        {grouped.length === 0 && <p className="text-xs text-gray-600">No day-specific items — check &quot;Always available&quot; above.</p>}
      </div>

      {chosen.length > 0 && (
        <div className="sticky bottom-4 pt-2">
          <button onClick={save} disabled={saving}
            className="w-full bg-teal-500 text-black font-bold py-4 rounded-2xl active:opacity-80 disabled:opacity-50">
            {saving ? <span className="flex items-center justify-center gap-2"><Spinner /> Saving…</span> : `Load ${chosen.length} item${chosen.length === 1 ? '' : 's'} · ${totalCarbs}g →`}
          </button>
        </div>
      )}
    </div>
  )
}
