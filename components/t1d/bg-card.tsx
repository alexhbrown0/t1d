'use client'

import { useEffect, useState } from 'react'
import type { DexcomEgv } from '@/types/health'

interface Props { egvs: DexcomEgv[] }

const TREND_ARROW: Record<string, string> = {
  rising: '↑', risingQuickly: '↑↑', steady: '→',
  falling: '↓', fallingQuickly: '↓↓', fortyFiveUp: '↗', fortyFiveDown: '↘', none: '→',
}

const TREND_LABEL: Record<string, string> = {
  rising: 'RISING', risingQuickly: 'RISING FAST', steady: 'STEADY',
  falling: 'FALLING', fallingQuickly: 'FALLING FAST', fortyFiveUp: 'RISING', fortyFiveDown: 'FALLING', none: 'STEADY',
}

function bgValue(value: number | null): string {
  if (!value) return '—'
  return String(Math.round(value))
}

function trendColor(value: number | null, trend: string | null): string {
  if (!value) return 'text-gray-500'
  if (value < 70) return 'text-red-400'
  if (value > 250) return 'text-red-400'
  if (trend === 'fallingQuickly') return 'text-red-400'
  if (trend === 'risingQuickly') return 'text-yellow-400'
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

  if (!lastTime) return (
    <div className="flex justify-between px-1 mb-1">
      <span className="text-[10px] text-gray-600">no data</span>
    </div>
  )

  const lastMs = new Date(lastTime).getTime()
  const elapsed = now - lastMs
  const nextMs = Math.max(0, 5 * 60 * 1000 - elapsed)

  const sinceColor = elapsed > 10 * 60 * 1000 ? 'text-red-400' : 'text-gray-500'

  return (
    <div className="flex justify-between px-1 mb-1">
      <span className={`text-[10px] font-mono ${sinceColor}`}>
        {fmtElapsed(elapsed)} <span className="text-gray-600 font-sans">since</span>
      </span>
      <span className="text-[10px] font-mono text-gray-600">
        {fmtElapsed(nextMs)} <span className="font-sans">next</span>
      </span>
    </div>
  )
}

export function BgCard({ egvs }: Props) {
  const latest = egvs[0]
  const prev = egvs[1]
  const trend = latest?.trend ?? 'none'
  const value = latest?.value_mgdl ? Number(latest.value_mgdl) : null
  const prevValue = prev?.value_mgdl ? Number(prev.value_mgdl) : null
  const delta = value != null && prevValue != null ? Math.round(value - prevValue) : null

  const trendCol = trendColor(value, trend)
  const trendLabel = TREND_LABEL[trend] ?? 'STEADY'

  return (
    <div className="bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${trendDotColor(value)}`} />
          <span className={`text-[10px] tracking-widest font-semibold ${trendCol}`}>{trendLabel}</span>
        </div>

        <div className="flex items-end gap-3">
          <span className="text-[58px] font-bold leading-none text-white tabular-nums">
            {latest?.status === 'HIGH' ? 'HI' : latest?.status === 'LOW' ? 'LO' : bgValue(value)}
          </span>
          <div className="pb-2 flex flex-col gap-1">
            <span className={`text-2xl font-light ${trendCol}`}>
              {TREND_ARROW[trend] ?? '→'}
            </span>
          </div>
          {delta != null && (
            <div className={`mb-3 ml-auto px-2.5 py-1 rounded-full text-xs font-semibold tabular-nums ${delta < 0 ? 'bg-red-500/20 text-red-400' : delta > 0 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-white/10 text-gray-400'}`}>
              {delta > 0 ? '+' : ''}{delta} <span className="text-[9px] font-normal opacity-70">VS. LAST</span>
            </div>
          )}
        </div>
        <p className="text-[10px] text-gray-600 tracking-widest font-medium mt-0.5">MG/DL</p>
      </div>

      <div className="px-3 pb-2">
        <ReadingTimer lastTime={latest?.system_time ?? null} />
        <BgChart egvs={egvs} />
      </div>
    </div>
  )
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
    .map((e) => ({ x: xOf(new Date(e.system_time).getTime()), y: yOf(Number(e.value_mgdl)) }))
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
      {/* Range bands */}
      <line x1={PAD.l} x2={W - PAD.r} y1={highY} y2={highY} stroke="#374151" strokeWidth="0.5" strokeDasharray="3,3" />
      <line x1={PAD.l} x2={W - PAD.r} y1={lowY} y2={lowY} stroke="#374151" strokeWidth="0.5" strokeDasharray="3,3" />
      <text x={PAD.l + 2} y={highY - 2} fill="#4b5563" fontSize="6">180</text>
      <text x={PAD.l + 2} y={lowY - 2} fill="#4b5563" fontSize="6">70</text>

      {/* Now line */}
      <line x1={nowX} x2={nowX} y1={PAD.t} y2={H - PAD.b} stroke="#374151" strokeWidth="0.5" />

      {/* BG fill + line */}
      {path && (
        <>
          <defs>
            <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path} L ${lastPoint?.x ?? nowX} ${H - PAD.b} L ${points[0].x} ${H - PAD.b} Z`} fill="url(#bgGrad)" />
          <path d={path} fill="none" stroke="#2dd4bf" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}

      {/* Reading dots */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill="#2dd4bf" />
      ))}

      {/* Latest reading dot (larger) */}
      {lastPoint && (
        <circle cx={lastPoint.x} cy={lastPoint.y} r="3.5" fill="#2dd4bf" />
      )}

      {/* Time axis */}
      <text x={PAD.l} y={H} fill="#4b5563" fontSize="7">-3h</text>
      <text x={xOf(now - 90 * 60 * 1000) - 8} y={H} fill="#4b5563" fontSize="7">-90m</text>
      <text x={nowX - 6} y={H} fill="#6b7280" fontSize="7">now</text>
      <text x={W - PAD.r - 14} y={H} fill="#4b5563" fontSize="7">+30m</text>
    </svg>
  )
}
