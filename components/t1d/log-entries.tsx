'use client'

import { useState } from 'react'

export interface LogEntry {
  id: string
  type: 'bolus' | 'low' | 'activity'
  timestamp: string
  label: string
  sub: string
  color: string
  dot: string
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

async function deleteEntry(entry: LogEntry) {
  if (entry.type === 'low') {
    return fetch(`/api/t1d/low-treatments?id=${entry.id}`, { method: 'DELETE' })
  }
  if (entry.type === 'bolus') {
    return fetch(`/api/t1d/dose-session/${entry.id}`, { method: 'DELETE' })
  }
}

export function LogEntries({ initialEntries }: { initialEntries: LogEntry[] }) {
  const [entries, setEntries] = useState(initialEntries)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (entry: LogEntry) => {
    if (confirmId !== entry.id) {
      setConfirmId(entry.id)
      return
    }
    setDeletingId(entry.id)
    setConfirmId(null)
    try {
      await deleteEntry(entry)
      setEntries(prev => prev.filter(e => e.id !== entry.id))
    } finally {
      setDeletingId(null)
    }
  }

  if (entries.length === 0) {
    return (
      <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-8 text-center">
        <p className="text-gray-600 text-sm">Nothing logged yet today</p>
        <p className="text-gray-700 text-xs mt-1">Use the quick actions to log events</p>
      </div>
    )
  }

  const groups: Record<string, LogEntry[]> = {}
  for (const entry of entries) {
    const key = formatDate(entry.timestamp)
    if (!groups[key]) groups[key] = []
    groups[key].push(entry)
  }

  return (
    <>
      {Object.entries(groups).map(([day, dayEntries]) => (
        <div key={day} className="space-y-2">
          <p className="text-[10px] tracking-widest text-gray-600 font-semibold">{day.toUpperCase()}</p>
          {dayEntries.map(entry => {
            const isConfirming = confirmId === entry.id
            const isDeleting = deletingId === entry.id
            return (
              <div
                key={entry.id}
                className="bg-[#141414] rounded-2xl border border-white/5 px-4 py-3 flex items-center gap-3"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${entry.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${entry.color}`}>{entry.label}</p>
                  {entry.sub && <p className="text-xs text-gray-500 mt-0.5">{entry.sub}</p>}
                </div>
                <span className="text-xs text-gray-600 flex-shrink-0">{formatTime(entry.timestamp)}</span>
                <button
                  onClick={() => handleDelete(entry)}
                  disabled={isDeleting}
                  className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    isConfirming
                      ? 'bg-red-500/20 text-red-400'
                      : 'text-gray-700 active:text-red-400'
                  } disabled:opacity-30`}
                >
                  {isDeleting ? (
                    <div className="w-3 h-3 rounded-full border border-gray-600 border-t-transparent animate-spin" />
                  ) : isConfirming ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      ))}
      {confirmId && (
        <p className="text-xs text-gray-600 text-center">Tap the checkmark again to confirm delete</p>
      )}
    </>
  )
}
