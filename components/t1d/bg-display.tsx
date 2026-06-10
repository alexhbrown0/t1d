'use client'

import type { DexcomEgv } from '@/types/health'

const TREND_ARROW: Record<string, string> = {
  flat: '→', singleUp: '↑', doubleUp: '↑↑',
  singleDown: '↓', doubleDown: '↓↓', fortyFiveUp: '↗', fortyFiveDown: '↘', none: '',
}

function bgColor(value: number | null): string {
  if (!value) return 'text-gray-400'
  if (value < 70) return 'text-red-400'
  if (value < 80) return 'text-orange-400'
  if (value <= 180) return 'text-green-400'
  if (value <= 250) return 'text-yellow-400'
  return 'text-red-400'
}

function deltaLabel(egvs: DexcomEgv[]): string {
  if (egvs.length < 2) return ''
  const gapMs = new Date(egvs[0].system_time).getTime() - new Date(egvs[1].system_time).getTime()
  if (gapMs > 10 * 60 * 1000) return ''
  const delta = (egvs[0].value_mgdl ?? 0) - (egvs[1].value_mgdl ?? 0)
  if (delta === 0) return '±0'
  return delta > 0 ? `+${delta}` : `${delta}`
}

export function BgDisplay({ egvs }: { egvs: DexcomEgv[] }) {
  const latest = egvs[0]

  if (!latest) {
    return (
      <div className="bg-gray-900 rounded-2xl p-6 text-center">
        <p className="text-gray-500 text-sm">No CGM data yet</p>
        <p className="text-gray-600 text-xs mt-1">Data arrives every 5 minutes</p>
      </div>
    )
  }

  const value = latest.value_mgdl
  const trend = latest.trend ?? 'none'
  const arrow = TREND_ARROW[trend] ?? ''
  const delta = deltaLabel(egvs)
  const staleMinutes = Math.floor((Date.now() - new Date(latest.system_time).getTime()) / 60000)
  const isStale = staleMinutes > 10

  return (
    <div className="bg-gray-900 rounded-2xl p-6">
      <div className="flex items-end gap-3">
        <span className={`text-7xl font-bold tabular-nums leading-none ${bgColor(value)}`}>
          {latest.status === 'HIGH' ? 'HIGH' : latest.status === 'LOW' ? 'LOW' : value ?? '—'}
        </span>
        <div className="pb-2 space-y-0.5">
          <div className="text-2xl text-gray-300">{arrow}</div>
          <div className="text-sm text-gray-400">{delta}</div>
        </div>
      </div>

      {isStale && (
        <p className="mt-2 text-xs text-yellow-500">
          Last reading {staleMinutes} min ago
        </p>
      )}

      {egvs.length >= 2 && (
        <div className="mt-4 flex gap-2 items-end h-8">
          {[...egvs].reverse().map((e, i) => {
            const h = Math.min(100, Math.max(10, ((e.value_mgdl ?? 100) / 400) * 100))
            return (
              <div
                key={i}
                className={`flex-1 rounded-sm ${bgColor(e.value_mgdl)}`}
                style={{ height: `${h}%`, opacity: i === egvs.length - 1 ? 1 : 0.5, backgroundColor: 'currentColor' }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
