'use client'

import { useEffect, useRef, useState } from 'react'
import { isParentDevice } from '@/lib/t1d/device'

interface EventRow {
  id: string
  kind: 'low' | 'dose' | 'correction' | 'meal' | string
  summary: string
  detail: string | null
  logged_by: string | null
  created_at: string
}

const ACKED_KEY = 't1d_events_acked'
const POLL_MS = 20_000
const LOOKBACK_MS = 24 * 60 * 60 * 1000

const KIND_STYLE: Record<string, { box: string; dot: string; text: string; label: string }> = {
  low: { box: 'bg-red-500/10 border-red-500/40', dot: 'bg-red-500', text: 'text-red-300', label: 'LOW TREATED' },
  dose: { box: 'bg-blue-500/10 border-blue-500/40', dot: 'bg-blue-500', text: 'text-blue-300', label: 'DOSE GIVEN' },
  correction: { box: 'bg-yellow-500/10 border-yellow-500/40', dot: 'bg-yellow-500', text: 'text-yellow-300', label: 'CORRECTION' },
  meal: { box: 'bg-teal-500/10 border-teal-500/40', dot: 'bg-teal-500', text: 'text-teal-300', label: 'MEAL LOGGED' },
}

function readAcked(): Set<string> {
  try {
    const raw = window.localStorage.getItem(ACKED_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function EventNotifier() {
  const [alerts, setAlerts] = useState<EventRow[]>([])
  const ackedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let stopped = false

    const poll = async () => {
      // Re-check each tick so enabling the toggle takes effect without a reload.
      if (isParentDevice()) {
        if (ackedRef.current.size === 0) ackedRef.current = readAcked()
        const since = new Date(Date.now() - LOOKBACK_MS).toISOString()
        try {
          const res = await fetch(`/api/t1d/events?since=${encodeURIComponent(since)}&limit=50`)
          const rows = (await res.json()) as EventRow[]
          if (Array.isArray(rows)) {
            const pending = rows
              .filter(r => r.logged_by !== 'parent' && !ackedRef.current.has(r.id))
              .reverse() // oldest first, newest at the bottom
            setAlerts(pending)
          }
        } catch { /* ignore */ }
      } else {
        setAlerts([])
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS)
    }

    poll()
    return () => { stopped = true; clearTimeout(timer) }
  }, [])

  const ack = (id: string) => {
    ackedRef.current.add(id)
    try {
      window.localStorage.setItem(ACKED_KEY, JSON.stringify([...ackedRef.current].slice(-200)))
    } catch { /* ignore */ }
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  if (alerts.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {alerts.map(a => {
        const s = KIND_STYLE[a.kind] ?? { box: 'bg-white/5 border-white/20', dot: 'bg-gray-400', text: 'text-gray-300', label: 'ACTIVITY' }
        return (
          <div key={a.id} className={`rounded-2xl border px-4 py-3 flex items-start gap-3 ${s.box}`}>
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${s.dot}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-[10px] tracking-widest font-semibold ${s.text}`}>{s.label}</p>
              <p className="text-sm text-white leading-snug mt-0.5">{a.summary}</p>
              {a.detail && <p className="text-xs text-gray-500 mt-0.5">{a.detail}</p>}
              <p className="text-[10px] text-gray-600 mt-1">{new Date(a.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
            </div>
            <button onClick={() => ack(a.id)}
              className={`flex-shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center active:opacity-70 ${s.box}`}
              aria-label="Confirm seen">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
