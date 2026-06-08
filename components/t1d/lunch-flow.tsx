'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { getCentralTime } from '@/lib/utils/central-time'
import type { T1dMealEvent, T1dDoseSession, MealItem } from '@/types/health'

type Phase = 'no_lunch' | 'packed' | 'pre_dose_ready' | 'eating' | 'followup_pending' | 'followup_ready' | 'complete'
type EatenPct = 0 | 25 | 50 | 75 | 100
const EAT_PCTS: EatenPct[] = [0, 25, 50, 75, 100]
const EAT_LABELS: Record<EatenPct, string> = { 0: 'None', 25: '25%', 50: 'Half', 75: '75%', 100: 'All' }

interface LunchData {
  meal: T1dMealEvent | null
  session: T1dDoseSession | null
  followUpSession: T1dDoseSession | null
  bg: { value_mgdl: number | null; trend: string | null } | null
  schedule: Array<{ event_type: string; start_time: string; end_time: string; day_of_week: number }>
  override: { pe_cancelled?: boolean; pe_start_time?: string | null } | null
  phase: Phase
}

const TREND: Record<string, string> = {
  rising: '↑', risingQuickly: '↑↑', steady: '→',
  falling: '↓', fallingQuickly: '↓↓', none: '—',
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

function InlineAsk({ mealEventId, onSuggestDose }: { mealEventId: string; onSuggestDose?: (grams: number) => void }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [photos, setPhotos] = useState<{ base64: string; mimeType: string }[]>([])
  const [reply, setReply] = useState<string | null>(null)
  const [suggestedDose, setSuggestedDose] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  const handlePhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const converted = await Promise.all(
      files.map(async f => ({ base64: await toBase64(f), mimeType: f.type || 'image/jpeg' }))
    )
    setPhotos(p => [...p, ...converted])
    e.target.value = ''
  }

  const send = async () => {
    if (!input.trim() && photos.length === 0) return
    setLoading(true)
    try {
      const res = await fetch('/api/t1d/lunch/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input.trim(),
          meal_event_id: mealEventId,
          photos: photos.length > 0 ? photos.map(p => ({ base64: p.base64, mime_type: p.mimeType })) : undefined,
        }),
      })
      const data = await res.json()
      if (data.reply) setReply(data.reply)
      if (data.suggested_dose_grams != null) setSuggestedDose(data.suggested_dose_grams)
    } finally {
      setLoading(false)
      setInput('')
      setPhotos([])
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full text-center text-xs text-teal-600 py-2 active:text-teal-400">
        Ask a question about this dose →
      </button>
    )
  }

  return (
    <div className="space-y-2 pt-1 border-t border-white/5">
      {reply && (
        <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl px-3 py-2.5 space-y-2">
          <p className="text-xs text-teal-300 leading-relaxed">{reply}</p>
          {suggestedDose != null && onSuggestDose && (
            <button
              onClick={() => { onSuggestDose(suggestedDose); setSuggestedDose(null); setReply(null); setOpen(false) }}
              className="w-full bg-teal-500/20 border border-teal-500/40 text-teal-300 text-xs font-semibold py-2 rounded-lg active:opacity-70"
            >
              Use {suggestedDose}g instead
            </button>
          )}
          <button onClick={() => { setReply(null); setSuggestedDose(null); setOpen(false) }} className="text-[10px] text-teal-700">Dismiss</button>
        </div>
      )}
      {photos.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {photos.map((p, i) => (
            <div key={i} className="relative">
              <img src={`data:${p.mimeType};base64,${p.base64}`} alt="" className="h-12 w-12 rounded-lg object-cover border border-white/10" />
              <button
                onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                className="absolute -top-1 -right-1 w-4 h-4 bg-gray-800 border border-white/20 rounded-full text-gray-400 text-[10px] flex items-center justify-center"
              >×</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 items-center">
        <button onClick={() => photoRef.current?.click()} className="text-gray-500 flex-shrink-0 active:text-teal-400">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && send()}
          placeholder="Ask about this dose…"
          className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-teal-500/40"
        />
        <button
          onClick={send}
          disabled={(!input.trim() && photos.length === 0) || loading}
          className="text-teal-400 disabled:text-gray-700 flex-shrink-0 transition-colors"
        >
          {loading ? <Spinner /> : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
      <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotos} />
    </div>
  )
}

export function LunchFlow({ initialData }: { initialData: LunchData }) {
  const [data, setData] = useState<LunchData>(initialData)
  const [loading, setLoading] = useState(false)
  const [preUnits, setPreUnits] = useState('')
  const [followUnits, setFollowUnits] = useState('')
  const [manualBg, setManualBg] = useState('')
  const [manualTrend, setManualTrend] = useState('')
  const [overrideDose, setOverrideDose] = useState('')
  const [eatenPcts, setEatenPcts] = useState<Record<string, EatenPct>>({})
  const [photoFilling, setPhotoFilling] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    const r = await fetch('/api/t1d/lunch/today')
    const d = await r.json()
    setData({ ...d, followUpSession: d.follow_up_session })
  }

  const handleClearLunch = async () => {
    if (!data.meal) return
    setLoading(true)
    try {
      await fetch(`/api/t1d/meal/${data.meal.id}`, { method: 'DELETE' })
      await refresh()
    } finally {
      setLoading(false)
    }
  }

  const handleReadyToEat = async () => {
    if (!data.meal) return
    setLoading(true)
    try {
      await fetch('/api/t1d/engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meal: data.meal.items_offered,
          meal_event_id: data.meal.id,
          starting_bg: data.bg?.value_mgdl ?? (manualBg ? parseFloat(manualBg) : null),
          starting_trend: data.bg?.trend ?? (manualTrend || null),
          entered_by: 'alexandra',
        }),
      })
      await refresh()
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmPre = async () => {
    if (!data.session) return
    setLoading(true)
    try {
      await fetch(`/api/t1d/dose-session/${data.session.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actual_dose_grams: overrideDose ? parseFloat(overrideDose) : data.session.recommended_dose_grams,
          pump_suggested_units: preUnits ? parseFloat(preUnits) : undefined,
          entered_by: 'alexandra',
        }),
      })
      setPreUnits('')
      await refresh()
    } finally {
      setLoading(false)
    }
  }

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !data.meal) return
    e.target.value = ''
    setPhotoFilling(true)
    try {
      const form = new FormData()
      form.append('photo', file)
      form.append('meal_id', data.meal.id)
      const resp = await fetch('/api/t1d/lunch/estimate-remaining', { method: 'POST', body: form })
      const result = await resp.json()
      if (result.items) {
        setEatenPcts(prev => {
          const next = { ...prev }
          for (const packed of data.meal!.items_offered) {
            const match = result.items.find((i: { name: string; eaten_pct: number }) =>
              packed.name.toLowerCase().includes(i.name.toLowerCase().slice(0, 6)) ||
              i.name.toLowerCase().includes(packed.name.toLowerCase().slice(0, 6))
            )
            if (match != null) next[packed.name] = match.eaten_pct as EatenPct
          }
          return next
        })
      }
    } catch {
      // photo failed — sliders stay at default, user adjusts manually
    } finally {
      setPhotoFilling(false)
    }
  }

  const handleSubmitEaten = async () => {
    if (!data.meal || !data.session) return
    setLoading(true)
    try {
      const items_eaten: MealItem[] = data.meal.items_offered.map(item => ({
        ...item,
        qty_eaten: item.qty_offered * ((eatenPcts[item.name] ?? 100) / 100),
      }))
      await fetch(`/api/t1d/meal/${data.meal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items_eaten, entered_by: 'alexandra' }),
      })
      await fetch('/api/t1d/lunch/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meal_event_id: data.meal.id, pre_dose_session_id: data.session.id }),
      })
      await refresh()
    } finally {
      setLoading(false)
    }
  }

  const handleAnotherDose = async () => {
    if (!data.meal || !data.session) return
    const latestSession = data.followUpSession ?? data.session
    setLoading(true)
    try {
      await fetch('/api/t1d/lunch/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meal_event_id: data.meal.id,
          pre_dose_session_id: latestSession.id,
          starting_bg: data.bg?.value_mgdl ?? (manualBg ? parseFloat(manualBg) : null),
          starting_trend: data.bg?.trend ?? (manualTrend || null),
        }),
      })
      await refresh()
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmFollowUp = async () => {
    if (!data.followUpSession) return
    setLoading(true)
    try {
      await fetch(`/api/t1d/dose-session/${data.followUpSession.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actual_dose_grams: data.followUpSession.recommended_dose_grams,
          pump_suggested_units: followUnits ? parseFloat(followUnits) : undefined,
          entered_by: 'alexandra',
        }),
      })
      setFollowUnits('')
      await refresh()
    } finally {
      setLoading(false)
    }
  }

  const { dayOfWeek: centralDay, minutesSinceMidnight: nowMin } = getCentralTime()
  const nextPe = data.override?.pe_cancelled ? null : data.schedule.find(
    s => s.event_type === 'pe' && s.day_of_week === centralDay && timeToMinutes(s.start_time) > nowMin
  )
  const peMin = nextPe ? timeToMinutes(nextPe.start_time) - nowMin : null
  const phase = data.phase

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/now" className="text-gray-500 flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div className="flex-1">
          <p className="text-[10px] tracking-widest text-teal-400 font-semibold">SCHOOL LUNCH</p>
          <p className="text-lg font-semibold text-white leading-tight">Today&apos;s Lunch</p>
        </div>
        <Link
          href={`/chat?q=${encodeURIComponent("Help me with Brooks's lunch dosing today")}`}
          className="text-xs text-gray-500 flex-shrink-0"
        >
          Chat →
        </Link>
      </div>

      {/* BG strip */}
      {data.bg?.value_mgdl != null && (
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm">{data.bg.value_mgdl}</span>
          {data.bg.trend && <span className="text-gray-400 text-sm">{TREND[data.bg.trend] ?? ''}</span>}
          {peMin != null && peMin < 120 && (
            <span className="text-amber-400 text-xs">· PE in {peMin}m</span>
          )}
        </div>
      )}

      {/* ── No lunch ─────────────────────────────────────────────────────── */}
      {phase === 'no_lunch' && (
        <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-10 text-center space-y-4">
          <p className="text-gray-400 text-sm">No lunch packed yet today</p>
          <Link href="/engine" className="inline-block bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold px-5 py-2.5 rounded-xl">
            Pack Lunch in Engine →
          </Link>
        </div>
      )}

      {/* ── Packed ───────────────────────────────────────────────────────── */}
      {phase === 'packed' && data.meal && (
        <>
          {loading ? (
            <div className="bg-[#141414] rounded-2xl border border-teal-500/20 px-5 py-14 text-center space-y-3">
              <Spinner className="h-8 w-8 text-teal-400 mx-auto" />
              <p className="text-white font-semibold">Calculating dose…</p>
              <p className="text-xs text-gray-500">This takes a few seconds</p>
            </div>
          ) : (
            <>
              <PackedItems items={data.meal.items_offered} total={data.meal.total_offered_carbs} />

              <div className="flex gap-2">
                <Link
                  href="/engine/lunch"
                  className="flex-1 bg-white/5 border border-white/10 text-gray-300 text-sm font-semibold py-3 rounded-xl text-center active:opacity-70"
                >
                  Edit Lunch
                </Link>
                <button
                  onClick={handleClearLunch}
                  disabled={loading}
                  className="flex-1 bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold py-3 rounded-xl active:opacity-70 disabled:opacity-40"
                >
                  Clear &amp; Start Over
                </button>
              </div>

              {!data.bg && (
                <div className="bg-[#141414] rounded-2xl border border-amber-500/20 p-4 space-y-3">
                  <p className="text-[10px] tracking-widest text-amber-400 font-semibold">NO CGM READING</p>
                  <p className="text-xs text-gray-500">Enter current BG and trend if you have them — or proceed without.</p>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={manualBg}
                    onChange={e => setManualBg(e.target.value)}
                    placeholder="Current BG (e.g. 120)"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-lg placeholder:text-gray-600 focus:outline-none focus:border-amber-500/50"
                  />
                  <div className="flex gap-1.5">
                    {([
                      { value: 'fallingQuickly', label: '↓↓' },
                      { value: 'falling',        label: '↓'  },
                      { value: 'steady',          label: '→'  },
                      { value: 'rising',          label: '↑'  },
                      { value: 'risingQuickly',  label: '↑↑' },
                    ] as const).map(t => (
                      <button
                        key={t.value}
                        onClick={() => setManualTrend(prev => prev === t.value ? '' : t.value)}
                        className={`flex-1 py-2.5 rounded-xl text-base font-semibold transition-colors ${
                          manualTrend === t.value
                            ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                            : 'bg-white/5 border border-white/10 text-gray-400'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleReadyToEat}
                className="w-full bg-teal-500 text-black font-bold py-4 rounded-2xl text-base active:opacity-80"
              >
                Ready to Eat →
              </button>
            </>
          )}
        </>
      )}

      {/* ── Pre-dose recommendation ───────────────────────────────────────── */}
      {phase === 'pre_dose_ready' && data.session && (
        <>
          <PackedItems items={data.meal?.items_offered ?? []} total={data.meal?.total_offered_carbs} dimmed />

          <div className="bg-[#141414] rounded-2xl border border-teal-500/30 p-5 space-y-4">
            <p className="text-[10px] tracking-widest text-teal-400 font-semibold">FIRST DOSE</p>

            <PreDoseAmount
              recommended={data.session.recommended_dose_grams ?? 0}
              override={overrideDose}
              onOverride={setOverrideDose}
            />

            {data.session.engine_reasoning && (
              <CollapsedReasoning text={data.session.engine_reasoning} />
            )}

            <div className="bg-black/40 rounded-xl p-3 font-mono text-xs text-teal-300 space-y-1">
              <p>1. Tap Bolus on Omnipod 5</p>
              <p>2. Select Manual</p>
              <p>3. Enter <span className="font-bold text-white">{overrideDose || data.session.recommended_dose_grams}g carbs</span></p>
              <p>4. Note the units the pump suggests below</p>
            </div>

            <div>
              <label className="text-[10px] tracking-widest text-gray-500 font-semibold">
                INSULIN UNITS (what the pump showed)
              </label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={preUnits}
                onChange={e => setPreUnits(e.target.value)}
                placeholder="e.g. 2.35"
                className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50"
              />
            </div>

            <button
              onClick={handleConfirmPre}
              disabled={loading}
              className="w-full bg-teal-500 text-black font-bold py-4 rounded-2xl active:opacity-80 disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2"><Spinner /> Saving…</span>
              ) : 'Dose Given ✓'}
            </button>

            {data.meal && <InlineAsk mealEventId={data.meal.id} onSuggestDose={g => { setOverrideDose(String(g)) }} />}
          </div>
        </>
      )}

      {/* ── Eating: log what he ate ───────────────────────────────────────── */}
      {phase === 'eating' && data.session && data.meal && (
        <>
          <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-4">
            <p className="text-[10px] tracking-widest text-teal-400 font-semibold mb-1">DOSE GIVEN</p>
            <p className="text-sm text-white">
              {data.session.recommended_dose_grams}g into pump
              {data.session.pump_suggested_units != null && (
                <span className="text-gray-400"> · {data.session.pump_suggested_units}u</span>
              )}
              {data.session.actual_dose_timestamp && (
                <span className="text-gray-500"> · {formatTime(data.session.actual_dose_timestamp)}</span>
              )}
            </p>
          </div>

          <div className="bg-[#141414] rounded-2xl border border-white/5 p-5 space-y-4">
            {/* Submit at top — always visible, shows live total */}
            {(() => {
              const totalEaten = data.meal.items_offered.reduce((s, item) => {
                const pct = eatenPcts[item.name] ?? 100
                return s + item.carbs * item.qty_offered * pct / 100
              }, 0)
              return (
                <button
                  onClick={handleSubmitEaten}
                  disabled={loading}
                  className="w-full bg-teal-500 text-black font-bold py-4 rounded-2xl active:opacity-80 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2"><Spinner /> Calculating follow-up…</span>
                  ) : `He ate ${Math.round(totalEaten)}g — Get Follow-up Dose →`}
                </button>
              )
            })()}

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/5" />
              <span className="text-[10px] text-gray-600 font-semibold tracking-widest">ADJUST IF NEEDED</span>
              <div className="flex-1 h-px bg-white/5" />
            </div>

            {/* Per-item percentage selectors */}
            <div className="space-y-4">
              {data.meal.items_offered.map(item => {
                const pct = eatenPcts[item.name] ?? 100
                const carbsEaten = Math.round(item.carbs * item.qty_offered * pct / 100)
                return (
                  <div key={item.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white">{item.name}</p>
                        {item.qty_offered !== 1 && (
                          <p className="text-[10px] text-gray-500">×{item.qty_offered} packed</p>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-teal-400 tabular-nums">{carbsEaten}g</p>
                    </div>
                    <div className="flex gap-1">
                      {EAT_PCTS.map(p => (
                        <button
                          key={p}
                          onClick={() => setEatenPcts(prev => ({ ...prev, [item.name]: p }))}
                          className={`flex-1 py-2 rounded-lg text-[11px] font-semibold transition-colors ${
                            pct === p ? 'bg-teal-500 text-black' : 'bg-white/5 text-gray-400'
                          }`}
                        >
                          {EAT_LABELS[p]}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Photo option — below items */}
            <button
              onClick={() => photoRef.current?.click()}
              disabled={photoFilling}
              className="w-full bg-white/5 border border-white/10 text-gray-400 text-sm font-semibold py-3 rounded-xl active:opacity-70 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {photoFilling ? (
                <><Spinner /> Analyzing photo…</>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  Use photo instead
                </>
              )}
            </button>
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoChange}
            />

            <InlineAsk mealEventId={data.meal.id} />
          </div>
        </>
      )}

      {/* ── Follow-up pending ─────────────────────────────────────────────── */}
      {phase === 'followup_pending' && (
        <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-10 text-center space-y-3">
          <Spinner className="h-6 w-6 text-teal-400 mx-auto" />
          <p className="text-sm text-white">Calculating follow-up dose…</p>
        </div>
      )}

      {/* ── Follow-up ready ───────────────────────────────────────────────── */}
      {phase === 'followup_ready' && data.followUpSession && (
        <>
          {data.meal?.items_eaten && (
            <EatenSummary items={data.meal.items_eaten as MealItem[]} />
          )}

          {data.followUpSession.recommended_dose_grams === 0 ? (
            <div className="bg-[#141414] rounded-2xl border border-teal-500/20 p-5 space-y-3">
              <p className="text-[10px] tracking-widest text-teal-400 font-semibold">NO DOSE NEEDED RIGHT NOW</p>
              <p className="text-sm text-gray-300 leading-relaxed">{data.followUpSession.engine_reasoning}</p>
              <p className="text-xs text-gray-600">You can check again later from the lunch summary if BG rises.</p>
              <button
                onClick={handleConfirmFollowUp}
                disabled={loading}
                className="w-full bg-white/5 border border-white/10 text-gray-300 font-semibold py-3.5 rounded-xl disabled:opacity-50"
              >
                {loading ? <span className="flex items-center justify-center gap-2"><Spinner /> Saving…</span> : 'Noted — done for now'}
              </button>
              {data.meal && <InlineAsk mealEventId={data.meal.id} />}
            </div>
          ) : (
            <div className="bg-[#141414] rounded-2xl border border-teal-500/30 p-5 space-y-4">
              <p className="text-[10px] tracking-widest text-teal-400 font-semibold">FOLLOW-UP DOSE</p>

              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-white">{data.followUpSession.recommended_dose_grams}g</span>
                <span className="text-gray-500 text-sm">into pump</span>
              </div>

              {data.followUpSession.engine_reasoning && (
                <p className="text-xs text-gray-400 leading-relaxed">{data.followUpSession.engine_reasoning}</p>
              )}

              <div>
                <label className="text-[10px] tracking-widest text-gray-500 font-semibold">
                  INSULIN UNITS (what the pump showed)
                </label>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={followUnits}
                  onChange={e => setFollowUnits(e.target.value)}
                  placeholder="e.g. 0.95"
                  className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50"
                />
              </div>

              <button
                onClick={handleConfirmFollowUp}
                disabled={loading}
                className="w-full bg-teal-500 text-black font-bold py-4 rounded-2xl active:opacity-80 disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2"><Spinner /> Saving…</span>
                ) : 'Follow-up Given ✓'}
              </button>

              {data.meal && <InlineAsk mealEventId={data.meal.id} />}
            </div>
          )}
        </>
      )}

      {/* ── Complete ─────────────────────────────────────────────────────── */}
      {phase === 'complete' && (
        <div className="bg-[#141414] rounded-2xl border border-teal-500/20 p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-white font-semibold">Lunch complete</p>
          </div>

          <div className="space-y-1.5 text-sm">
            {data.session && (
              <div className="flex justify-between">
                <span className="text-gray-500">
                  Pre-bolus
                  {data.session.actual_dose_timestamp && (
                    <span className="ml-1 text-gray-600">{formatTime(data.session.actual_dose_timestamp)}</span>
                  )}
                </span>
                <span className="text-white">
                  {data.session.recommended_dose_grams}g
                  {data.session.pump_suggested_units != null && (
                    <span className="text-gray-500 ml-1">· {data.session.pump_suggested_units}u</span>
                  )}
                </span>
              </div>
            )}
            {data.followUpSession && (data.followUpSession.recommended_dose_grams ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">
                  Follow-up
                  {data.followUpSession.actual_dose_timestamp && (
                    <span className="ml-1 text-gray-600">{formatTime(data.followUpSession.actual_dose_timestamp)}</span>
                  )}
                </span>
                <span className="text-white">
                  {data.followUpSession.recommended_dose_grams}g
                  {data.followUpSession.pump_suggested_units != null && (
                    <span className="text-gray-500 ml-1">· {data.followUpSession.pump_suggested_units}u</span>
                  )}
                </span>
              </div>
            )}
            {data.meal?.total_eaten_carbs != null && (
              <div className="flex justify-between pt-1 border-t border-white/5">
                <span className="text-gray-500">Total eaten</span>
                <span className="text-white">{Math.round(data.meal.total_eaten_carbs)}g</span>
              </div>
            )}
          </div>

          {!data.bg && (
            <div className="bg-[#141414] rounded-xl border border-amber-500/20 p-4 space-y-2">
              <p className="text-[10px] tracking-widest text-amber-400 font-semibold">ENTER CURRENT BG</p>
              <p className="text-xs text-gray-500">Helps the engine give a better recommendation.</p>
              <input
                type="number"
                inputMode="numeric"
                value={manualBg}
                onChange={e => setManualBg(e.target.value)}
                placeholder="e.g. 145"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-lg placeholder:text-gray-600 focus:outline-none focus:border-amber-500/50"
              />
              <div className="flex gap-1.5">
                {([
                  { value: 'fallingQuickly', label: '↓↓' },
                  { value: 'falling',        label: '↓'  },
                  { value: 'steady',          label: '→'  },
                  { value: 'rising',          label: '↑'  },
                  { value: 'risingQuickly',  label: '↑↑' },
                ] as const).map(t => (
                  <button
                    key={t.value}
                    onClick={() => setManualTrend(prev => prev === t.value ? '' : t.value)}
                    className={`flex-1 py-2 rounded-xl text-base font-semibold transition-colors ${
                      manualTrend === t.value
                        ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                        : 'bg-white/5 border border-white/10 text-gray-400'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleAnotherDose}
            disabled={loading}
            className="w-full bg-white/5 border border-white/10 text-gray-400 text-sm font-semibold py-3.5 rounded-xl disabled:opacity-40"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2"><Spinner /> Checking…</span>
            ) : 'Check if another dose is needed →'}
          </button>

          <Link
            href={`/chat?q=${encodeURIComponent("How did Brooks's lunch go today?")}`}
            className="block text-center text-xs text-teal-400"
          >
            Review with assistant →
          </Link>
        </div>
      )}
    </div>
  )
}

function PreDoseAmount({ recommended, override, onOverride }: {
  recommended: number
  override: string
  onOverride: (v: string) => void
}) {
  const [adjusting, setAdjusting] = useState(false)
  const display = override ? parseFloat(override) : recommended

  if (adjusting) {
    return (
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="1"
            value={override || recommended}
            onChange={e => onOverride(e.target.value)}
            autoFocus
            className="w-28 bg-black/40 border border-teal-500/40 rounded-xl px-3 py-2 text-4xl font-bold text-white focus:outline-none"
          />
          <span className="text-gray-500 text-sm">g into pump</span>
          <button onClick={() => setAdjusting(false)} className="text-xs text-gray-500 ml-auto">Done</button>
        </div>
        <p className="text-[10px] text-gray-600">Engine recommended {recommended}g</p>
      </div>
    )
  }

  return (
    <div className="flex items-baseline gap-2">
      <span className="text-5xl font-bold text-white">{display}g</span>
      <span className="text-gray-500 text-sm">into pump</span>
      {override && <span className="text-[10px] text-amber-400 ml-1">(adjusted from {recommended}g)</span>}
      <button onClick={() => setAdjusting(true)} className="text-xs text-gray-600 ml-auto active:text-gray-400">Adjust</button>
    </div>
  )
}

function CollapsedReasoning({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const firstSentence = text.split(/\.\s+/)[0] + '.'

  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-400 leading-relaxed">
        {expanded ? text : firstSentence}
      </p>
      <button
        onClick={() => setExpanded(e => !e)}
        className="text-[10px] text-teal-600 active:text-teal-400"
      >
        {expanded ? 'Show less' : 'Full reasoning →'}
      </button>
    </div>
  )
}

function PackedItems({ items, total, dimmed = false }: { items: MealItem[]; total?: number | null; dimmed?: boolean }) {
  const computedTotal = total ?? items.reduce((s, i) => s + i.carbs * i.qty_offered, 0)
  return (
    <div className={`space-y-2 transition-opacity ${dimmed ? 'opacity-40' : ''}`}>
      <p className="text-[10px] tracking-widest text-gray-500 font-semibold">PACKED TODAY</p>
      {items.map((item, i) => (
        <div key={i} className="bg-[#141414] rounded-xl border border-white/5 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">{item.name}</p>
            {item.qty_offered !== 1 && (
              <p className="text-xs text-gray-500 mt-0.5">× {item.qty_offered}</p>
            )}
          </div>
          <p className="text-sm font-semibold text-teal-400">{Math.round(item.carbs * item.qty_offered)}g</p>
        </div>
      ))}
      <div className="px-4 py-2 flex justify-between">
        <span className="text-xs text-gray-600">Total</span>
        <span className="text-sm font-bold text-white">{Math.round(computedTotal)}g</span>
      </div>
    </div>
  )
}

function EatenSummary({ items }: { items: MealItem[] }) {
  const totalEaten = items.reduce((s, i) => s + i.carbs * (i.qty_eaten ?? 0), 0)
  return (
    <div className="bg-[#141414] rounded-2xl border border-white/5 p-4 space-y-2">
      <p className="text-[10px] tracking-widest text-gray-500 font-semibold">WHAT HE ATE</p>
      {items.map((item, i) => {
        const pct = item.qty_offered > 0 ? Math.round(((item.qty_eaten ?? 0) / item.qty_offered) * 100) : 0
        return (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-300">{item.name}</span>
            <span className={pct === 0 ? 'text-gray-600' : 'text-gray-400'}>{pct}%</span>
          </div>
        )
      })}
      <div className="pt-2 border-t border-white/5 flex justify-between text-sm">
        <span className="text-gray-500">Eaten</span>
        <span className="text-white font-semibold">{Math.round(totalEaten)}g</span>
      </div>
    </div>
  )
}
