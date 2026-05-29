'use client'

import { useState } from 'react'
import Link from 'next/link'
import { EngineToday } from '@/components/t1d/engine-today'
import { EngineLunchEntry } from '@/components/t1d/engine-lunch-entry'
import { EngineData } from '@/components/t1d/engine-data'
import { EngineParams } from '@/components/t1d/engine-params'

const TABS = ['TODAY', 'LUNCH', 'FOODS', 'DATA', 'ENGINE'] as const
type Tab = typeof TABS[number]

export default function EnginePage() {
  const [tab, setTab] = useState<Tab>('TODAY')

  return (
    <div className="px-4 pt-5 pb-4 space-y-4">
      {/* Header */}
      <div>
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold">ENGINE</p>
        <p className="text-lg font-semibold text-white mt-0.5">Dosing Engine</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-[10px] font-semibold py-2 rounded-lg transition-colors ${
              tab === t
                ? 'bg-white/10 text-white'
                : 'text-gray-500'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'TODAY' && <EngineToday />}
      {tab === 'LUNCH' && <EngineLunchEntry />}
      {tab === 'FOODS' && (
        <Link href="/engine/foods">
          <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Food Repository</p>
              <p className="text-xs text-gray-500 mt-0.5">Manage Brooks&apos;s known foods and carb counts</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </Link>
      )}
      {tab === 'DATA' && <EngineData />}
      {tab === 'ENGINE' && <EngineParams />}
    </div>
  )
}
