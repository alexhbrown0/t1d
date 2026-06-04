'use client'

import { useState } from 'react'
import type { T1dDailyOverride } from '@/types/health'

interface Props {
  date: string
  initial: T1dDailyOverride | null
}

type Draft = {
  camp_cancelled: boolean
  pe_cancelled: boolean
  pe_start_time: string
  pe_end_time: string
  lunch_start_time: string
  snack_cancelled: boolean
  notes: string
}

function toDraft(o: T1dDailyOverride | null): Draft {
  return {
    camp_cancelled: o?.camp_cancelled ?? false,
    pe_cancelled: o?.pe_cancelled ?? false,
    pe_start_time: o?.pe_start_time ?? '',
    pe_end_time: o?.pe_end_time ?? '',
    lunch_start_time: o?.lunch_start_time ?? '',
    snack_cancelled: o?.snack_cancelled ?? false,
    notes: o?.notes ?? '',
  }
}

function hasAnyOverride(d: Draft) {
  return d.camp_cancelled || d.pe_cancelled || d.snack_cancelled ||
    d.pe_start_time || d.pe_end_time || d.lunch_start_time || d.notes
}

export function ScheduleOverride({ date, initial }: Props) {
  const [open, setOpen] = useState(!!initial && hasAnyOverride(toDraft(initial)))
  const [draft, setDraft] = useState<Draft>(toDraft(initial))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const set = (k: keyof Draft, v: string | boolean) =>
    setDraft(p => ({ ...p, [k]: v }))

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await fetch('/api/t1d/daily-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ override_date: date, ...draft }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const clear = async () => {
    setSaving(true)
    try {
      await fetch(`/api/t1d/daily-override?date=${date}`, { method: 'DELETE' })
      setDraft(toDraft(null))
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-[#141414] border border-dashed border-white/10 rounded-2xl px-5 py-3.5 text-left flex items-center justify-between active:opacity-70"
      >
        <span className="text-sm text-gray-500">Override today&apos;s schedule</span>
        <span className="text-gray-600 text-lg leading-none">+</span>
      </button>
    )
  }

  return (
    <div className="bg-[#141414] rounded-2xl border border-white/10 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold">TODAY&apos;S OVERRIDE</p>
        <button onClick={clear} disabled={saving} className="text-[10px] text-gray-600 active:text-red-400">Clear all</button>
      </div>

      {/* Camp cancelled */}
      <Toggle
        label="No camp today"
        sub="Skips all dosing context for the day"
        value={draft.camp_cancelled}
        onChange={v => set('camp_cancelled', v)}
        activeColor="bg-red-500/20 border-red-500/30 text-red-300"
      />

      {!draft.camp_cancelled && (
        <>
          {/* Rec/PE */}
          <Toggle
            label="Rec / PE cancelled"
            sub="No activity reduction on lunch or snack dose"
            value={draft.pe_cancelled}
            onChange={v => set('pe_cancelled', v)}
          />

          {!draft.pe_cancelled && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-gray-600 font-semibold">REC TIME (if moved)</p>
              <div className="flex gap-2">
                <input type="time" value={draft.pe_start_time} onChange={e => set('pe_start_time', e.target.value)}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500/50" />
                <span className="text-gray-600 self-center text-xs">to</span>
                <input type="time" value={draft.pe_end_time} onChange={e => set('pe_end_time', e.target.value)}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500/50" />
              </div>
            </div>
          )}

          {/* Lunch time */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-gray-600 font-semibold">LUNCH TIME (if moved)</p>
            <input type="time" value={draft.lunch_start_time} onChange={e => set('lunch_start_time', e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500/50" />
          </div>

          {/* Snack */}
          <Toggle
            label="No afternoon snack"
            sub="Snack won't be served today"
            value={draft.snack_cancelled}
            onChange={v => set('snack_cancelled', v)}
          />
        </>
      )}

      {/* Notes */}
      <div className="space-y-1.5">
        <p className="text-[10px] text-gray-600 font-semibold">NOTES (visible to AI)</p>
        <input
          type="text"
          value={draft.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="e.g. field trip, early pickup, he's tired…"
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50"
        />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold py-3 rounded-xl disabled:opacity-40"
      >
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Override'}
      </button>
    </div>
  )
}

function Toggle({ label, sub, value, onChange, activeColor }: {
  label: string; sub: string; value: boolean
  onChange: (v: boolean) => void; activeColor?: string
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-full rounded-xl border px-4 py-3 flex items-center justify-between text-left transition-colors ${
        value
          ? (activeColor ?? 'bg-orange-500/10 border-orange-500/30')
          : 'bg-black/20 border-white/5'
      }`}
    >
      <div>
        <p className={`text-sm font-semibold ${value ? (activeColor ? 'text-red-300' : 'text-orange-300') : 'text-gray-400'}`}>{label}</p>
        <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>
      </div>
      <div className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
        value ? 'border-teal-500 bg-teal-500' : 'border-gray-600'
      }`}>
        {value && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
      </div>
    </button>
  )
}
