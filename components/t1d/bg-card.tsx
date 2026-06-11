'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { DexcomEgv } from '@/types/health'

interface Props { egvs: DexcomEgv[] }
interface Insight { text: string; cta: 'chat' | 'lunch'; cta_label: string; is_stable: boolean }

const GAP_MS = 10 * 60 * 1000

function rateToTrend(rate: number): string {
  if (rate > 3) return 'doubleUp'
  if (rate > 2) return 'singleUp'
  if (rate > 1.5) return 'fortyFiveUp'
  if (rate > -1.5) return 'flat'
  if (rate > -3) return 'fortyFiveDown'
  if (rate > -4) return 'singleDown'
  return 'doubleDown'
}

function computedTrend(egvs: DexcomEgv[]): string {
  const pts = egvs.filter(e => e.value_mgdl != null).slice(0, 2)
  if (pts.length < 2) return egvs[0]?.trend ?? 'none'
  const gapMs = new Date(pts[0].system_time).getTime() - new Date(pts[1].system_time).getTime()
  if (gapMs <= 0 || gapMs > 10 * 60 * 1000) return egvs[0]?.trend ?? 'none'
  const rate = (Number(pts[0].value_mgdl) - Number(pts[1].value_mgdl)) / (gapMs / 60000)
  return rateToTrend(rate)
}

const TREND_ARROW: Record<string, string> = {
  flat: '→', singleUp: '↑', doubleUp: '↑↑',
  singleDown: '↓', doubleDown: '↓↓', fortyFiveUp: '↗', fortyFiveDown: '↘', none: '→',
}

const TREND_LABEL: Record<string, string> = {
  flat: 'STEADY', singleUp: 'RISING', doubleUp: 'RISING FAST',
  singleDown: 'FALLING', doubleDown: 'FALLING FAST', fortyFiveUp: 'RISING', fortyFiveDown: 'FALLING', none: 'STEADY',
}

function bgValue(value: number | null): string {
  if (!value) return '—'
  return String(Math.round(value))
}

function trendColor(value: number | null, trend: string | null): string {
  if (!value) return 'text-gray-500'
  if (value < 70) return 'text-red-400'
  if (value > 250) return 'text-red-400'
  if (trend === 'doubleDown' || trend === 'singleDown') return 'text-red-400'
  if (trend === 'doubleUp') return 'text-yellow-400'
  return 'text-teal-400'
}

function trendDotColor(value: number | null): string {
  if (!value) return 'bg-gray-500'
  if (value < 70 || value > 250) return 'bg-red-400'
  return 'bg-teal-400'
}

function fmtElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function ReadingTimer({ lastTime }: { lastTime: string | null }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!lastTime) return <span className="text-[10px] text-gray-600">no data</span>

  const elapsed = now - new Date(lastTime).getTime()
  const nextMs = Math.max(0, 5 * 60 * 1000 - elapsed)
  const stale = elapsed > 10 * 60 * 1000

  return (
    <span className={`text-[10px] font-mono ${stale ? 'text-red-400' : 'text-gray-600'}`}>
      {fmtElapsed(elapsed)} <span className="font-sans opacity-60">·</span> {fmtElapsed(nextMs)}
    </span>
  )
}

export function BgCard({ egvs: initialEgvs }: Props) {
  const [egvs, setEgvs] = useState<DexcomEgv[]>(initialEgvs)
  const [insight, setInsight] = useState<Insight | null>(null)
  const [insightExpanded, setInsightExpanded] = useState(false)
  const latestTimeRef = useRef(initialEgvs[0]?.system_time)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>

    const schedulePoll = () => {
      const latestTime = latestTimeRef.current
      let delay: number
      if (latestTime) {
        const msUntilNext = new Date(latestTime).getTime() + 5 * 60 * 1000 - Date.now()
        if (msUntilNext > 30_000) {
          delay = msUntilNext + 10_000  // wake up 10s after the expected reading time
        } else if (msUntilNext > 0) {
          delay = msUntilNext + 5_000   // nearly due: wake up 5s after
        } else {
          delay = 15_000                // overdue: retry every 15s until it arrives
        }
      } else {
        delay = 30_000
      }
      timeoutId = setTimeout(poll, delay)
    }

    const poll = async () => {
      try {
        const [bgRes, insightRes] = await Promise.all([
          fetch('/api/t1d/bg-latest'),
          fetch('/api/t1d/insight'),
        ])
        const bgData = await bgRes.json()
        const insightData = await insightRes.json()
        if (Array.isArray(bgData) && bgData[0]?.system_time !== latestTimeRef.current) {
          latestTimeRef.current = bgData[0].system_time
          setEgvs(prev => [bgData[0], ...prev.filter(e => e.system_time !== bgData[0].system_time)])
          setInsightExpanded(false) // collapse on new reading
        }
        if (insightData?.text) setInsight(insightData)
      } catch { /* ignore network errors */ }
      schedulePoll()
    }

    fetch('/api/t1d/insight').then(r => r.json()).then(d => { if (d?.text) setInsight(d) }).catch(() => null)

    schedulePoll()
    return () => clearTimeout(timeoutId)
  }, [])

  const latest = egvs[0]
  const prev = egvs[1]
  const trend = computedTrend(egvs)
  const value = latest?.value_mgdl ? Number(latest.value_mgdl) : null
  const prevValue = prev?.value_mgdl ? Number(prev.value_mgdl) : null
  const gapMs = latest && prev
    ? new Date(latest.system_time).getTime() - new Date(prev.system_time).getTime()
    : Infinity
  const delta = value != null && prevValue != null && gapMs <= GAP_MS
    ? Math.round(value - prevValue)
    : null

  const trendCol = trendColor(value, trend)
  const trendLabel = TREND_LABEL[trend] ?? 'STEADY'

  return (
    <div className="bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${trendDotColor(value)}`} />
            <span className={`text-[10px] tracking-widest font-semibold ${trendCol}`}>{trendLabel}</span>
          </div>
          <ReadingTimer lastTime={latest?.system_time ?? null} />
        </div>
        <div className="flex items-end gap-3">
          <span className="text-[72px] font-bold leading-none text-white tabular-nums">
            {latest?.status === 'HIGH' ? 'HI' : latest?.status === 'LOW' ? 'LO' : bgValue(value)}
          </span>
          <span className={`text-[52px] leading-none font-light pb-1 ${trendCol}`}>{TREND_ARROW[trend] ?? '→'}</span>
          {delta != null && (
            <span className={`text-2xl font-bold pb-2.5 tabular-nums ${delta < 0 ? 'text-red-400' : delta > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
              {delta > 0 ? '+' : ''}{delta}
            </span>
          )}
        </div>
        <p className="text-[10px] text-gray-600 tracking-widest font-medium mt-0.5">MG/DL</p>
      </div>

      <div className="px-3 pb-2">
        <BgChart egvs={egvs} />
      </div>

      {insight && (
        <div className="border-t border-white/5">
          {insight.is_stable ? (
            <div className="px-4 py-2.5 flex items-center gap-2">
              <AiStars />
              <p className="text-xs text-gray-500">{insight.text}</p>
            </div>
          ) : insightExpanded ? (
            <div className="px-4 py-3 space-y-3">
              <p className="text-sm text-gray-200 leading-snug">{insight.text}</p>
              <div className="flex items-center justify-between">
                <Link
                  href={insight.cta === 'lunch' ? '/engine/lunch' : `/chat?q=${encodeURIComponent(insight.text)}`}
                  className="text-xs font-semibold text-teal-400"
                >
                  {insight.cta_label} →
                </Link>
                <button onClick={() => setInsightExpanded(false)} className="text-[10px] text-gray-600">
                  collapse
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setInsightExpanded(true)}
              className="w-full px-4 py-2.5 flex items-center gap-2 text-left"
            >
              <AiStars />
              <p className="text-xs text-gray-300 flex-1 truncate">{insight.text}</p>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function AiStars() {
  return (
    <svg width="16" height="11" viewBox="0 0 16 11" fill="none" className="flex-shrink-0">
      {/* larger star */}
      <path d="M4.5 0 L5.35 3.65 L9 4.5 L5.35 5.35 L4.5 9 L3.65 5.35 L0 4.5 L3.65 3.65 Z" fill="#2dd4bf" />
      {/* smaller star */}
      <path d="M12.5 0 L13.1 2.4 L15.5 3 L13.1 3.6 L12.5 6 L11.9 3.6 L9.5 3 L11.9 2.4 Z" fill="#2dd4bf" fillOpacity="0.5" />
    </svg>
  )
}

function dotColor(bg: number | null): string {
  if (!bg) return '#6b7280'
  if (bg < 70) return '#f87171'
  if (bg > 180) return '#fbbf24'
  return '#2dd4bf'
}

function BgChart({ egvs }: { egvs: DexcomEgv[] }) {
  const W = 320
  const H = 64
  const PAD = { l: 4, r: 4, t: 6, b: 14 }
  const LOW = 70
  const HIGH = 180
  const MIN_BG = 50
  const MAX_BG = 300

  const windowMs = 3.5 * 60 * 60 * 1000
  const now = Date.now()
  const startMs = now - 3 * 60 * 60 * 1000

  function xOf(t: number) {
    return PAD.l + ((t - startMs) / windowMs) * (W - PAD.l - PAD.r)
  }
  function yOf(bg: number) {
    const clamped = Math.max(MIN_BG, Math.min(MAX_BG, bg))
    return PAD.t + (1 - (clamped - MIN_BG) / (MAX_BG - MIN_BG)) * (H - PAD.t - PAD.b)
  }

  const nowX = xOf(now)
  const lowY = yOf(LOW)
  const highY = yOf(HIGH)

  const points = [...egvs]
    .filter((e) => e.value_mgdl != null)
    .reverse()
    .map((e) => ({
      x: xOf(new Date(e.system_time).getTime()),
      y: yOf(Number(e.value_mgdl)),
      color: dotColor(e.value_mgdl),
    }))
    .filter((p) => p.x >= PAD.l && p.x <= W - PAD.r)

  let path = ''
  if (points.length > 1) {
    path = `M ${points[0].x} ${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const cx = (prev.x + curr.x) / 2
      path += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`
    }
  }

  const lastPoint = points[points.length - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 64 }}>
      {/* Out-of-range background zones */}
      <rect x={PAD.l} y={lowY} width={W - PAD.l - PAD.r} height={H - PAD.b - lowY} fill="#ef4444" fillOpacity="0.08" />
      <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={highY - PAD.t} fill="#f59e0b" fillOpacity="0.05" />

      {/* Range lines */}
      <line x1={PAD.l} x2={W - PAD.r} y1={highY} y2={highY} stroke="#374151" strokeWidth="0.5" strokeDasharray="3,3" />
      <line x1={PAD.l} x2={W - PAD.r} y1={lowY} y2={lowY} stroke="#ef4444" strokeWidth="0.5" strokeDasharray="3,3" strokeOpacity="0.5" />
      <text x={PAD.l + 2} y={highY - 2} fill="#4b5563" fontSize="6">180</text>
      <text x={PAD.l + 2} y={lowY - 2} fill="#6b7280" fontSize="6">70</text>

      {/* Now line */}
      <line x1={nowX} x2={nowX} y1={PAD.t} y2={H - PAD.b} stroke="#374151" strokeWidth="0.5" />

      {/* BG line — gray guide */}
      {path && (
        <path d={path} fill="none" stroke="#4b5563" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      )}

      {/* Reading dots — colored by range */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={p.color} />
      ))}

      {/* Latest dot (larger) */}
      {lastPoint && (
        <circle cx={lastPoint.x} cy={lastPoint.y} r="4" fill={lastPoint.color} />
      )}

      {/* Time axis */}
      <text x={PAD.l} y={H} fill="#4b5563" fontSize="7">-3h</text>
      <text x={xOf(now - 90 * 60 * 1000) - 8} y={H} fill="#4b5563" fontSize="7">-90m</text>
      <text x={nowX - 6} y={H} fill="#6b7280" fontSize="7">now</text>
      <text x={W - PAD.r - 14} y={H} fill="#4b5563" fontSize="7">+30m</text>
    </svg>
  )
}
