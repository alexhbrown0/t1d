'use client'

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

export function BgCard({ egvs }: Props) {
  const latest = egvs[0]
  const prev = egvs[1]
  const trend = latest?.trend ?? 'none'
  const value = latest?.value_mgdl ? Number(latest.value_mgdl) : null
  const prevValue = prev?.value_mgdl ? Number(prev.value_mgdl) : null
  const delta = value != null && prevValue != null ? Math.round(value - prevValue) : null

  const staleMs = latest ? Date.now() - new Date(latest.system_time).getTime() : null
  const staleMin = staleMs ? Math.floor(staleMs / 60000) : null
  const sinceLabel = staleMin != null ? `${staleMin}m since` : '—'

  const trendCol = trendColor(value, trend)
  const trendLabel = TREND_LABEL[trend] ?? 'STEADY'

  return (
    <div className="bg-[#141414] rounded-2xl border border-white/5 overflow-hidden">
      {/* BG reading */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-1.5 mb-2">
          <div className={`w-1.5 h-1.5 rounded-full ${trendDotColor(value)}`} />
          <span className={`text-[10px] tracking-widest font-semibold ${trendCol}`}>{trendLabel}</span>
        </div>

        <div className="flex items-end gap-3">
          <span className="text-[72px] font-bold leading-none text-white tabular-nums">
            {latest?.status === 'HIGH' ? 'HI' : latest?.status === 'LOW' ? 'LO' : bgValue(value)}
          </span>
          <div className="pb-3 flex flex-col gap-1">
            <span className={`text-3xl font-light ${trendCol}`}>
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

      {/* Chart */}
      <BgChart egvs={egvs} sinceLabel={sinceLabel} />
    </div>
  )
}

function BgChart({ egvs, sinceLabel }: { egvs: DexcomEgv[]; sinceLabel: string }) {
  const W = 320
  const H = 80
  const PAD = { l: 4, r: 4, t: 8, b: 16 }
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
    <div className="px-1 pb-1">
      {/* Timer labels */}
      <div className="flex justify-between px-4 mb-1">
        <span className="text-[10px] text-gray-600">{sinceLabel}</span>
        <span className="text-[10px] text-gray-600">+30m</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 80 }}>
        {/* Reference lines */}
        <line x1={PAD.l} x2={W - PAD.r} y1={highY} y2={highY} stroke="#374151" strokeWidth="0.5" strokeDasharray="3,3" />
        <line x1={PAD.l} x2={W - PAD.r} y1={lowY} y2={lowY} stroke="#374151" strokeWidth="0.5" strokeDasharray="3,3" />
        <text x={PAD.l + 2} y={highY - 2} fill="#4b5563" fontSize="6">180</text>
        <text x={PAD.l + 2} y={lowY - 2} fill="#4b5563" fontSize="6">70</text>

        {/* Now line */}
        <line x1={nowX} x2={nowX} y1={PAD.t} y2={H - PAD.b} stroke="#374151" strokeWidth="0.5" />

        {/* BG path */}
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

        {/* Now arrow */}
        {lastPoint && (
          <g transform={`translate(${Math.min(lastPoint.x, nowX - 2)}, ${lastPoint.y - 5})`}>
            <circle r="3" fill="#2dd4bf" />
          </g>
        )}

        {/* Time labels */}
        <text x={PAD.l} y={H} fill="#4b5563" fontSize="7">-3h</text>
        <text x={xOf(now - 30 * 60 * 1000) - 6} y={H} fill="#4b5563" fontSize="7">-30m</text>
        <text x={nowX - 6} y={H} fill="#6b7280" fontSize="7">now</text>
      </svg>
    </div>
  )
}
