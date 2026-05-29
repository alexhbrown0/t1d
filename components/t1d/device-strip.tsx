'use client'

import { useState } from 'react'
import { DeviceModal } from './device-modal'

interface DeviceRecord {
  id: string
  type: 'cgm' | 'pod'
  inserted_at: string | null
  expires_at: string | null
  grace_expires_at: string | null
  serial_number: string | null
  lot_number: string | null
  sequence_number: string | null
  model: string | null
  removed_at: string | null
  removal_reason: string | null
  failure_notes: string | null
  alarm_code: string | null
  claim_submitted: boolean
}

interface Props {
  initialCgm: DeviceRecord | null
  initialPod: DeviceRecord | null
}

const CGM_GRACE_H = 252
const POD_GRACE_H = 80

function timeRemaining(device: DeviceRecord | null, graceH: number) {
  if (!device?.inserted_at) return { label: '—', pct: 0, urgent: false, overdue: false }
  const elapsed = (Date.now() - new Date(device.inserted_at).getTime()) / 3600000
  const remaining = graceH - elapsed
  const overdue = remaining <= 0
  const urgent = remaining < 8 && remaining > 0
  const pct = Math.max(0, Math.min(1, remaining / graceH))

  if (overdue) return { label: 'CHANGE NOW', pct: 0, urgent: true, overdue: true }
  if (remaining < 24) {
    const h = Math.floor(remaining)
    const m = Math.round((remaining - h) * 60)
    return { label: `${h}h ${m}m`, pct, urgent, overdue: false }
  }
  const d = Math.floor(remaining / 24)
  const h = Math.floor(remaining % 24)
  return { label: `${d}d ${h}h`, pct, urgent, overdue: false }
}

function Tile({
  label, device, graceH, onClick,
}: {
  label: string
  device: DeviceRecord | null
  graceH: number
  onClick: () => void
}) {
  const { label: timeLabel, pct, urgent, overdue } = timeRemaining(device, graceH)
  const color = overdue || urgent ? 'text-red-400' : 'text-teal-400'
  const barColor = overdue || urgent ? 'bg-red-500' : 'bg-teal-500'

  return (
    <button
      onClick={onClick}
      className="flex-1 bg-[#141414] rounded-xl border border-white/5 px-3 py-2.5 text-left active:scale-95 transition-transform"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] tracking-widest text-gray-600 font-semibold">{label}</span>
        <span className={`text-xs font-bold tabular-nums ${color}`}>{timeLabel}</span>
      </div>
      <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct * 100}%` }} />
      </div>
      <p className="text-[9px] text-gray-700 mt-1">tap to change</p>
    </button>
  )
}

export function DeviceStrip({ initialCgm, initialPod }: Props) {
  const [cgm, setCgm] = useState<DeviceRecord | null>(initialCgm)
  const [pod, setPod] = useState<DeviceRecord | null>(initialPod)
  const [modal, setModal] = useState<'cgm' | 'pod' | null>(null)

  function handleInserted(d: DeviceRecord) {
    if (d.type === 'cgm') setCgm(d)
    else setPod(d)
  }

  function handleRemoved(id: string) {
    if (cgm?.id === id) setCgm(null)
    if (pod?.id === id) setPod(null)
  }

  return (
    <>
      <div className="flex gap-2">
        <Tile label="CGM" device={cgm} graceH={CGM_GRACE_H} onClick={() => setModal('cgm')} />
        <Tile label="POD" device={pod} graceH={POD_GRACE_H} onClick={() => setModal('pod')} />
      </div>

      {modal && (
        <DeviceModal
          device={modal === 'cgm' ? cgm : pod}
          type={modal}
          onClose={() => setModal(null)}
          onDeviceInserted={handleInserted}
          onDeviceRemoved={handleRemoved}
        />
      )}
    </>
  )
}
