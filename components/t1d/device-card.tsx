'use client'

import { useState } from 'react'

interface DeviceChange {
  type: 'cgm' | 'pod'
  changed_at: string
}

interface Props {
  cgm: DeviceChange | null
  pod: DeviceChange | null
}

const CGM_LIFE_H = 10 * 24   // G7: 10 days
const POD_LIFE_H = 80        // Omnipod 5: 80 hours

function timeUntil(changedAt: string | null, lifespanHours: number) {
  if (!changedAt) return { label: '—', urgent: false }
  const elapsed = (Date.now() - new Date(changedAt).getTime()) / 1000 / 3600
  const remaining = lifespanHours - elapsed
  if (remaining <= 0) return { label: 'CHANGE NOW', urgent: true }
  if (remaining < 24) {
    const h = Math.floor(remaining)
    const m = Math.round((remaining - h) * 60)
    return { label: `${h}h ${m}m`, urgent: remaining < 8 }
  }
  const d = Math.floor(remaining / 24)
  const h = Math.floor(remaining % 24)
  return { label: `${d}d ${h}h`, urgent: false }
}

function DeviceTile({
  icon, label, changedAt, lifespanHours, onLog,
}: {
  icon: React.ReactNode
  label: string
  changedAt: string | null
  lifespanHours: number
  onLog: () => void
}) {
  const { label: timeLabel, urgent } = timeUntil(changedAt, lifespanHours)

  return (
    <div className="flex-1 bg-[#1a1a1a] rounded-xl p-3 space-y-2 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-teal-400">
          {icon}
        </div>
        <span className="text-[9px] tracking-widest text-gray-600 font-semibold">{label}</span>
      </div>
      <div>
        <p className={`text-lg font-bold tabular-nums leading-none ${urgent ? 'text-red-400' : 'text-white'}`}>
          {timeLabel}
        </p>
        <p className="text-[9px] text-gray-600 tracking-widest mt-0.5">UNTIL CHANGE</p>
      </div>
      <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${urgent ? 'bg-red-500/60' : 'bg-teal-500/30'}`} />
      <button
        onClick={onLog}
        className="text-[10px] text-gray-600 hover:text-teal-400 transition-colors"
      >
        log change →
      </button>
    </div>
  )
}

export function DeviceCard({ cgm, pod }: Props) {
  const [logging, setLogging] = useState<'cgm' | 'pod' | null>(null)
  const [cgmData, setCgmData] = useState(cgm)
  const [podData, setPodData] = useState(pod)

  async function logChange(type: 'cgm' | 'pod') {
    setLogging(type)
    const res = await fetch('/api/t1d/device-changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    })
    if (res.ok) {
      const { changed_at } = await res.json()
      if (type === 'cgm') setCgmData({ type: 'cgm', changed_at })
      else setPodData({ type: 'pod', changed_at })
    }
    setLogging(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] tracking-widest text-gray-500 font-semibold">DEVICES</span>
        <span className="text-[10px] text-gray-600">HISTORY →</span>
      </div>
      <div className="flex gap-2">
        <DeviceTile
          icon={<CgmIcon />}
          label="CGM"
          changedAt={cgmData?.changed_at ?? null}
          lifespanHours={CGM_LIFE_H}
          onLog={() => !logging && logChange('cgm')}
        />
        <DeviceTile
          icon={<PodIcon />}
          label="POD"
          changedAt={podData?.changed_at ?? null}
          lifespanHours={POD_LIFE_H}
          onLog={() => !logging && logChange('pod')}
        />
      </div>
    </div>
  )
}

function CgmIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4" />
    </svg>
  )
}

function PodIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="6" y="4" width="12" height="16" rx="6" />
      <path d="M12 9v6M9 12h6" />
    </svg>
  )
}
