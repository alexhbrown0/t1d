'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

export function CafeteriaSyncButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const sync = async () => {
    setLoading(true); setMsg(null); setErr(null)
    try {
      const res = await fetch('/api/t1d/cafeteria-menu/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setErr(data.error ?? 'Sync failed'); return }
      setMsg(`Updated ${data.rows} items across ${data.dates} days (${(data.months ?? []).join(', ')}).`)
      router.refresh()
    } catch {
      setErr('Network error — try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-[#141414] rounded-2xl border border-teal-500/20 p-4 space-y-2">
      <p className="text-[10px] tracking-widest text-teal-400 font-semibold">DISTRICT MENU</p>
      <p className="text-xs text-gray-500">Pulls this month &amp; next from the school nutrition site (with carbs). Runs nightly on its own — use this to refresh now.</p>
      <button onClick={sync} disabled={loading}
        className="w-full bg-teal-500 text-black font-bold py-3 rounded-xl active:opacity-80 disabled:opacity-50">
        {loading ? <span className="flex items-center justify-center gap-2"><Spinner /> Pulling menu…</span> : 'Refresh menu now'}
      </button>
      {msg && <p className="text-xs text-teal-400">{msg}</p>}
      {err && <p className="text-xs text-amber-400">{err}</p>}
    </div>
  )
}
