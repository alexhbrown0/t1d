'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { logEvent } from '@/lib/t1d/device'
import type { T1dCafeteriaMenuItem } from '@/types/health'

const CATEGORY_ORDER = ['entree', 'side', 'milk', 'condiment', 'other'] as const
const CATEGORY_LABEL: Record<string, string> = {
  entree: 'ENTRÉES', side: 'SIDES', milk: 'MILK', condiment: 'CONDIMENTS', other: 'OTHER',
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

// View-only preview of today's cafeteria menu. Nothing is created until the
// caregiver taps "Verify" — so just looking at the menu never commits the day.
export function LunchroomVerify({ menu, stapleNames }: { menu: T1dCafeteriaMenuItem[]; stapleNames: string[] }) {
  const router = useRouter()
  const [verifying, setVerifying] = useState(false)
  const [staplesOpen, setStaplesOpen] = useState(false)

  const stapleSet = new Set(stapleNames)
  const featured = menu.filter(m => !stapleSet.has(m.name))
  const staples = menu.filter(m => stapleSet.has(m.name))
  const grouped = CATEGORY_ORDER.map(cat => ({
    cat,
    items: featured.filter(m => (m.category ?? 'other') === cat),
  })).filter(g => g.items.length > 0)

  const verify = async () => {
    setVerifying(true)
    try {
      await fetch('/api/t1d/meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: 'school_lunch',
          is_cafeteria: true,
          items: [],
          source: 'cafeteria',
          entered_by: 'alexandra',
        }),
      })
      await logEvent('meal', 'Eating in lunchroom today')
      router.push('/lunch')
    } finally {
      setVerifying(false)
    }
  }

  const row = (m: T1dCafeteriaMenuItem) => (
    <div key={m.id} className="bg-[#141414] rounded-xl border border-white/5 px-4 py-3 flex items-center justify-between">
      <span className="text-sm text-white">{m.name}</span>
      <span className="text-xs text-teal-400">{Math.round(Number(m.carbs_g))}g</span>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/now" className="text-gray-500 flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div>
          <p className="text-[10px] tracking-widest text-teal-400 font-semibold">TODAY&apos;S LUNCHROOM MENU</p>
          <p className="text-lg font-semibold text-white">What&apos;s being served</p>
        </div>
      </div>

      <p className="text-xs text-gray-500">Just checking the menu? Tap back — nothing is set until you verify below.</p>

      {menu.length === 0 ? (
        <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-8 text-center space-y-3">
          <p className="text-sm text-gray-400">No cafeteria menu loaded for today.</p>
          <Link href="/engine/menu" className="inline-block text-xs font-semibold text-teal-400">Upload the month&apos;s menu →</Link>
        </div>
      ) : (
        <>
          {staples.length > 0 && (
            <div className="space-y-2">
              <button onClick={() => setStaplesOpen(o => !o)} className="w-full flex items-center justify-between px-1 py-1">
                <span className="text-[10px] tracking-widest text-gray-500 font-semibold">ALWAYS AVAILABLE</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" className={`transition-transform ${staplesOpen ? 'rotate-180' : ''}`}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {staplesOpen && <div className="space-y-2">{staples.map(row)}</div>}
            </div>
          )}
          <div className="space-y-4">
            <p className="text-[10px] tracking-widest text-teal-400 font-semibold">TODAY&apos;S MENU</p>
            {grouped.map(({ cat, items }) => (
              <div key={cat} className="space-y-2">
                <p className="text-[10px] tracking-widest text-gray-600 font-semibold">{CATEGORY_LABEL[cat]}</p>
                {items.map(row)}
              </div>
            ))}
            {grouped.length === 0 && <p className="text-xs text-gray-600">No day-specific items — check &quot;Always available&quot; above.</p>}
          </div>
        </>
      )}

      <div className="flex gap-2 pt-1">
        <Link href="/now" className="flex-1 bg-white/5 border border-white/10 text-gray-300 text-sm font-semibold py-3.5 rounded-2xl text-center active:opacity-70">
          Back
        </Link>
        <button onClick={verify} disabled={verifying}
          className="flex-1 bg-teal-500 text-black font-bold py-3.5 rounded-2xl active:opacity-80 disabled:opacity-50">
          {verifying ? <span className="flex items-center justify-center gap-2"><Spinner /> Setting…</span> : 'Verify — he&apos;s eating here →'}
        </button>
      </div>
    </div>
  )
}
