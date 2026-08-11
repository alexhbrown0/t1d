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

const LAST_SEEN_KEY = 't1d_events_last_seen'
const POLL_MS = 30_000

const KIND_STYLE: Record<string, { border: string; dot: string; label: string }> = {
  low: { border: 'border-red-500/40', dot: 'bg-red-500', label: 'LOW TREATED' },
  dose: { border: 'border-blue-500/40', dot: 'bg-blue-500', label: 'DOSE GIVEN' },
  correction: { border: 'border-yellow-500/40', dot: 'bg-yellow-500', label: 'CORRECTION' },
  meal: { border: 'border-teal-500/40', dot: 'bg-teal-500', label: 'MEAL LOGGED' },
}

export function EventNotifier() {
  const [toasts, setToasts] = useState<EventRow[]>([])
  const lastSeenRef = useRef<string>('')

  useEffect(() => {
    if (!isParentDevice()) return

    lastSeenRef.current = window.localStorage.getItem(LAST_SEEN_KEY) ?? new Date().toISOString()

    let timer: ReturnType<typeof setTimeout>
    let stopped = false

    const poll = async () => {
      try {
        const res = await fetch(`/api/t1d/events?since=${encodeURIComponent(lastSeenRef.current)}`)
        const rows = (await res.json()) as EventRow[]
        if (Array.isArray(rows) && rows.length > 0) {
          // newest-first from API; advance lastSeen to the newest
          lastSeenRef.current = rows[0].created_at
          window.localStorage.setItem(LAST_SEEN_KEY, lastSeenRef.current)
          const fromOthers = rows.filter(r => r.logged_by !== 'parent').reverse()
          if (fromOthers.length > 0) {
            setToasts(prev => [...prev, ...fromOthers].slice(-5))
          }
        }
      } catch { /* ignore */ }
      if (!stopped) timer = setTimeout(poll, POLL_MS)
    }

    poll()
    return () => { stopped = true; clearTimeout(timer) }
  }, [])

  const dismiss = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const scheduled = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const t of toasts) {
      if (scheduled.current.has(t.id)) continue
      scheduled.current.add(t.id)
      setTimeout(() => dismiss(t.id), 15_000)
    }
  }, [toasts])

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-3 right-3 z-50 flex flex-col gap-2 w-[min(92vw,360px)]">
      {toasts.map(t => {
        const s = KIND_STYLE[t.kind] ?? { border: 'border-white/20', dot: 'bg-gray-400', label: 'ACTIVITY' }
        return (
          <div key={t.id} className={`bg-[#1a1a1a] rounded-xl border ${s.border} shadow-lg px-4 py-3 flex items-start gap-3 animate-[fadeIn_.15s_ease-out]`}>
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${s.dot}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] tracking-widest text-gray-500 font-semibold">{s.label}</p>
              <p className="text-sm text-white leading-snug mt-0.5">{t.summary}</p>
              {t.detail && <p className="text-xs text-gray-500 mt-0.5">{t.detail}</p>}
              <p className="text-[10px] text-gray-600 mt-1">{new Date(t.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
            </div>
            <button onClick={() => dismiss(t.id)} className="text-gray-600 active:text-gray-300 flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
