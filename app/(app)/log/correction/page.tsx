'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LogCorrectionPage() {
  const router = useRouter()
  const [bg, setBg] = useState('')
  const [trend, setTrend] = useState<string | null>(null)
  const [delta, setDelta] = useState<number | null>(null)
  const [activitySoon, setActivitySoon] = useState(false)
  const [loading, setLoading] = useState(true)
  const [recommendation, setRecommendation] = useState<string | null>(null)
  const [computing, setComputing] = useState(false)

  const TREND_ARROW: Record<string, string> = {
    rising: '↑', risingQuickly: '↑↑', steady: '→',
    falling: '↓', fallingQuickly: '↓↓', fortyFiveUp: '↗', fortyFiveDown: '↘',
  }

  useEffect(() => {
    fetch('/api/t1d/bg-latest')
      .then(r => r.json())
      .then(data => {
        const reading = Array.isArray(data) ? data[0] : data
        const prev = Array.isArray(data) ? data[1] : null
        if (reading?.value_mgdl) setBg(String(Math.round(reading.value_mgdl)))
        if (reading?.trend) setTrend(reading.trend)
        if (reading && prev && reading.value_mgdl != null && prev.value_mgdl != null) {
          const gapMs = new Date(reading.system_time).getTime() - new Date(prev.system_time).getTime()
          if (gapMs <= 10 * 60 * 1000) setDelta(Math.round(reading.value_mgdl - prev.value_mgdl))
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const getRecommendation = async () => {
    if (!bg) return
    setComputing(true)
    const res = await fetch('/api/t1d/correction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bg: parseFloat(bg), activity_soon: activitySoon }),
    }).catch(() => null)
    if (res?.ok) {
      const data = await res.json()
      setRecommendation(data.recommendation ?? null)
    }
    setComputing(false)
  }

  const bgNum = parseFloat(bg)
  const isHigh = bgNum > 180

  return (
    <div className="px-4 pt-5 pb-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <p className="text-[10px] tracking-widest text-yellow-400 font-semibold">CORRECTION</p>
          <p className="text-lg font-semibold text-white">Bring Down</p>
        </div>
      </div>

      {/* BG display */}
      <div className="bg-[#141414] rounded-2xl border border-white/5 p-4">
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold mb-3">CURRENT BG</p>
        <div className="flex items-end gap-3">
          <input
            type="number"
            value={bg}
            onChange={e => setBg(e.target.value)}
            placeholder="—"
            className={`text-4xl font-bold bg-transparent outline-none w-24 ${
              isHigh ? 'text-yellow-400' : 'text-white'
            }`}
          />
          <div className="pb-1 flex items-center gap-2">
            <span className="text-gray-500 text-sm">mg/dL</span>
            {trend && <span className={`text-xl ${isHigh ? 'text-yellow-400' : 'text-gray-300'}`}>{TREND_ARROW[trend] ?? ''}</span>}
            {delta != null && (
              <span className={`text-sm font-semibold tabular-nums ${delta < 0 ? 'text-red-400' : delta > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
                {delta > 0 ? '+' : ''}{delta}
              </span>
            )}
          </div>
        </div>
        {loading && <p className="text-xs text-gray-600 mt-1">Fetching from CGM...</p>}
        {!loading && bg && <p className="text-xs text-gray-600 mt-1">From Dexcom · tap to edit</p>}
      </div>

      {/* Activity toggle */}
      <div className="bg-[#141414] rounded-2xl border border-white/5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Activity in next hour?</p>
            <p className="text-xs text-gray-500 mt-0.5">Engine will reduce correction if yes</p>
          </div>
          <button
            onClick={() => setActivitySoon(prev => !prev)}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              activitySoon ? 'bg-teal-500' : 'bg-white/10'
            }`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
              activitySoon ? 'left-7' : 'left-1'
            }`} />
          </button>
        </div>
      </div>

      {/* Get recommendation */}
      <button
        onClick={getRecommendation}
        disabled={!bg || computing}
        className="w-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 font-semibold py-4 rounded-2xl text-sm disabled:opacity-40"
      >
        {computing ? 'Calculating...' : 'Get Correction Guidance'}
      </button>

      {/* Recommendation */}
      {recommendation && (
        <div className="bg-[#141414] rounded-2xl border border-yellow-500/20 p-4">
          <p className="text-[10px] tracking-widest text-yellow-400 font-semibold mb-2">GUIDANCE</p>
          <p className="text-sm text-gray-200 leading-relaxed">{recommendation}</p>
          <div className="mt-4 pt-4 border-t border-white/5">
            <p className="text-xs text-gray-600 mb-2">Corrections are done via the Omnipod pump</p>
            <div className="flex items-center gap-2 text-xs text-teal-400">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                <line x1="6" y1="1" x2="6" y2="4" />
                <line x1="10" y1="1" x2="10" y2="4" />
                <line x1="14" y1="1" x2="14" y2="4" />
              </svg>
              Open Omnipod 5 app to deliver
            </div>
          </div>
        </div>
      )}

      {!recommendation && bg && (
        <div className="bg-[#141414] rounded-2xl border border-white/5 p-4 text-center">
          <p className="text-xs text-gray-500">Corrections are delivered via the Omnipod 5 pump</p>
          <p className="text-xs text-gray-600 mt-1">The app will calculate how many carb-equivalents to enter</p>
        </div>
      )}
    </div>
  )
}
