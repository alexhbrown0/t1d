'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Insight {
  text: string
  cta: 'lunch' | 'chat'
  cta_label: string
}

export function InsightTile() {
  const [insight, setInsight] = useState<Insight | null>(null)

  useEffect(() => {
    fetch('/api/t1d/insight')
      .then(r => r.json())
      .then(setInsight)
      .catch(() => setInsight({ text: 'Tap to open assistant.', cta: 'chat', cta_label: 'Open assistant' }))
  }, [])

  if (!insight) {
    return (
      <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-4 space-y-2.5 animate-pulse">
        <div className="h-2 bg-white/8 rounded w-20" />
        <div className="h-3 bg-white/8 rounded w-full" />
        <div className="h-3 bg-white/8 rounded w-4/5" />
        <div className="h-2 bg-white/8 rounded w-28 mt-1" />
      </div>
    )
  }

  const urgent = /low|drop|treat|below/i.test(insight.text)
  const href = insight.cta === 'lunch'
    ? '/engine/lunch'
    : `/chat?q=${encodeURIComponent(insight.text)}`

  return (
    <Link href={href}>
      <div className={`bg-[#141414] rounded-2xl border px-5 py-4 flex items-start gap-4 active:opacity-80 transition-opacity ${
        urgent ? 'border-red-500/20' : 'border-teal-500/20'
      }`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
          urgent ? 'bg-red-500/10' : 'bg-teal-500/10'
        }`}>
          {insight.cta === 'lunch' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={urgent ? '#f87171' : '#2dd4bf'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11l19-9-9 19-2-8-8-2z" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={urgent ? '#f87171' : '#2dd4bf'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <span className={`text-[10px] font-semibold tracking-widest ${urgent ? 'text-red-400' : 'text-teal-400'}`}>
            {insight.cta === 'lunch' ? 'LUNCH PREP' : 'INSIGHT'}
          </span>
          <p className="text-sm text-white leading-relaxed mt-1">{insight.text}</p>
          <p className={`text-xs mt-2 font-medium ${urgent ? 'text-red-400' : 'text-teal-400'}`}>
            {insight.cta_label} →
          </p>
        </div>
      </div>
    </Link>
  )
}
