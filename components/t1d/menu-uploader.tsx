'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface MenuItem { name: string; carbs_g: number; category?: string | null }
interface MenuDay { date: string; items: MenuItem[] }

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

export function MenuUploader({ existingDates }: { existingDates: string[] }) {
  const router = useRouter()
  const [days, setDays] = useState<MenuDay[] | null>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setParsing(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const resp = await fetch('/api/t1d/cafeteria-menu/parse', { method: 'POST', body: form })
      const data = await resp.json().catch(() => null)
      if (!resp.ok || !data) {
        if (resp.status === 504) setError('The menu took too long to read. Try again, or upload one page/month at a time.')
        else setError(data?.error ?? `Could not read the menu (error ${resp.status}).`)
        return
      }
      setDays(data.days ?? [])
    } catch {
      setError('Upload failed — network error. Try again.')
    } finally {
      setParsing(false)
    }
  }

  const save = async () => {
    if (!days) return
    setSaving(true)
    try {
      await fetch('/api/t1d/cafeteria-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      })
      router.refresh()
      setDays(null)
    } finally {
      setSaving(false)
    }
  }

  const updateItem = (di: number, ii: number, patch: Partial<MenuItem>) => {
    setDays(prev => prev!.map((d, i) => i !== di ? d : {
      ...d, items: d.items.map((it, j) => j !== ii ? it : { ...it, ...patch }),
    }))
  }
  const removeItem = (di: number, ii: number) => {
    setDays(prev => prev!.map((d, i) => i !== di ? d : { ...d, items: d.items.filter((_, j) => j !== ii) }))
  }

  if (days) {
    const totalItems = days.reduce((s, d) => s + d.items.length, 0)
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] tracking-widest text-teal-400 font-semibold">REVIEW · {days.length} DAYS · {totalItems} ITEMS</p>
          <button onClick={() => setDays(null)} className="text-[10px] text-gray-500">Discard</button>
        </div>
        <button onClick={save} disabled={saving}
          className="w-full bg-teal-500 text-black font-bold py-4 rounded-2xl active:opacity-80 disabled:opacity-50">
          {saving ? <span className="flex items-center justify-center gap-2"><Spinner /> Saving…</span> : 'Save Menu'}
        </button>
        {days.map((d, di) => (
          <div key={di} className="bg-[#141414] rounded-2xl border border-white/5 p-4 space-y-2">
            <p className="text-sm font-semibold text-white">{fmtDate(d.date)}</p>
            {d.items.map((it, ii) => (
              <div key={ii} className="flex items-center gap-2">
                <input value={it.name} onChange={e => updateItem(di, ii, { name: e.target.value })}
                  className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500/50" />
                <input type="number" step="0.1" value={it.carbs_g} onChange={e => updateItem(di, ii, { carbs_g: parseFloat(e.target.value) || 0 })}
                  className="w-16 bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:border-teal-500/50" />
                <button onClick={() => removeItem(di, ii)} className="text-gray-600 active:text-red-400 flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-300">{error}</p>
        </div>
      )}
      <div className="bg-[#141414] rounded-2xl border border-dashed border-white/15 px-5 py-10 text-center space-y-3">
        {parsing ? (
          <>
            <Spinner className="h-6 w-6 text-teal-400 mx-auto" />
            <p className="text-sm text-white">Reading the menu…</p>
            <p className="text-xs text-gray-500">This can take up to a minute for a full month</p>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-400">Upload the month&apos;s cafeteria menu (PDF)</p>
            <p className="text-xs text-gray-600">Carb counts will be extracted per day</p>
            <button onClick={() => fileRef.current?.click()} className="bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold px-6 py-3 rounded-xl">
              Choose PDF
            </button>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
          </>
        )}
      </div>
      {existingDates.length > 0 && (
        <p className="text-xs text-gray-600 text-center">
          Menu loaded for {existingDates.length} day{existingDates.length === 1 ? '' : 's'} ·
          {' '}{fmtDate(existingDates[0])} – {fmtDate(existingDates[existingDates.length - 1])}
        </p>
      )}
    </div>
  )
}
