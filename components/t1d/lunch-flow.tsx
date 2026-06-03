'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import type { T1dMealEvent, T1dDoseSession, MealItem } from '@/types/health'

type Phase = 'no_lunch' | 'packed' | 'pre_dose_ready' | 'eating' | 'followup_pending' | 'followup_ready' | 'complete'
type EatenChoice = 'all' | 'half' | 'none'

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

export function LunchFlow({ initialData }: { initialData: LunchData }) {
  const [data, setData] = useState<LunchData>(initialData)
  const [loading, setLoading] = useState(false)
  const [preUnits, setPreUnits] = useState('')
  const [followUnits, setFollowUnits] = useState('')
  const [eatenMode, setEatenMode] = useState<'idle' | 'manual' | 'photo_processing' | 'photo_review'>('idle')
  const [eatenChoices, setEatenChoices] = useState<Record<string, EatenChoice>>({})
  const [photoEstimate, setPhotoEstimate] = useState<{ items_eaten: MealItem[]; notes?: string | null } | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    const r = await fetch('/api/t1d/lunch/today')
    const d = await r.json()
    setData({ ...d, followUpSession: d.follow_up_session })
  }

  // ── Ready to Eat: call engine ──────────────────────────────────────────
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
          starting_bg: data.bg?.value_mgdl ?? null,
          starting_trend: data.bg?.trend ?? null,
          entered_by: 'alexandra',
        }),
      })
      await refresh()
    } finally {
      setLoading(false)
    }
  }

  // ── Confirm pre-bolus given ────────────────────────────────────────────
  const handleConfirmPre = async () => {
    if (!data.session) return
    setLoading(true)
    try {
      await fetch(`/api/t1d/dose-session/${data.session.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actual_dose_grams: data.session.recommended_dose_grams,
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

  // ── Submit eaten choices (manual) ─────────────────────────────────────
  const handleSubmitManual = async () => {
    if (!data.meal || !data.session) return
    setLoading(true)
    try {
      const items_eaten: MealItem[] = data.meal.items_offered.map(item => {
        const choice = eatenChoices[item.name] ?? 'all'
        const qtyEaten = choice === 'all' ? item.qty_offered : choice === 'half' ? item.qty_offered * 0.5 : 0
        return { ...item, qty_eaten: qtyEaten }
      })
      await saveEatenAndGetFollowUp(items_eaten)
    } finally {
      setLoading(false)
      setEatenMode('idle')
    }
  }

  // ── Photo upload ───────────────────────────────────────────────────────
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !data.meal) return
    setEatenMode('photo_processing')
    try {
      const form = new FormData()
      form.append('photo', file)
      form.append('meal_id', data.meal.id)
      const resp = await fetch('/api/t1d/lunch/estimate-remaining', { method: 'POST', body: form })
      const estimate = await resp.json()
      setPhotoEstimate(estimate)
      setEatenMode('photo_review')
    } catch {
      setEatenMode('idle')
    }
  }

  const handleConfirmPhoto = async () => {
    if (!photoEstimate || !data.meal || !data.session) return
    setLoading(true)
    try {
      await saveEatenAndGetFollowUp(photoEstimate.items_eaten)
    } finally {
      setLoading(false)
      setEatenMode('idle')
      setPhotoEstimate(null)
    }
  }

  // ── Shared: save items_eaten + trigger follow-up calculation ──────────
  const saveEatenAndGetFollowUp = async (items_eaten: MealItem[]) => {
    await fetch(`/api/t1d/meal/${data.meal!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items_eaten, entered_by: 'alexandra' }),
    })
    await fetch('/api/t1d/lunch/follow-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal_event_id: data.meal!.id, pre_dose_session_id: data.session!.id }),
    })
    await refresh()
  }

  // ── Confirm follow-up given ────────────────────────────────────────────
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

  // ── PE context ────────────────────────────────────────────────────────
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const nextPe = data.override?.pe_cancelled ? null : data.schedule.find(
    s => s.event_type === 'pe' && s.day_of_week === now.getDay() && timeToMinutes(s.start_time) > nowMin
  )
  const peMin = nextPe ? timeToMinutes(nextPe.start_time) - nowMin : null
  const phase = data.phase

  // ── Render ─────────────────────────────────────────────────────────────
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

      {/* BG + context strip */}
      {data.bg?.value_mgdl != null && (
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm">{data.bg.value_mgdl}</span>
          {data.bg.trend && <span className="text-gray-400 text-sm">{TREND[data.bg.trend] ?? ''}</span>}
          {peMin != null && peMin < 120 && (
            <span className="text-amber-400 text-xs">· PE in {peMin}m</span>
          )}
        </div>
      )}

      {/* ── No lunch packed ────────────────────────────────────────────── */}
      {phase === 'no_lunch' && (
        <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-10 text-center space-y-4">
          <p className="text-gray-400 text-sm">No lunch packed yet today</p>
          <Link
            href="/engine"
            className="inline-block bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold px-5 py-2.5 rounded-xl"
          >
            Pack Lunch in Engine →
          </Link>
        </div>
      )}

      {/* ── Packed: show items + Ready to Eat ─────────────────────────── */}
      {phase === 'packed' && data.meal && (
        <>
          <PackedItems items={data.meal.items_offered} total={data.meal.total_offered_carbs} />
          <button
            onClick={handleReadyToEat}
            disabled={loading}
            className="w-full bg-teal-500 text-black font-bold py-4 rounded-2xl text-base active:opacity-80 disabled:opacity-50"
          >
            {loading ? 'Calculating dose…' : 'Ready to Eat →'}
          </button>
        </>
      )}

      {/* ── Pre-dose recommendation ────────────────────────────────────── */}
      {phase === 'pre_dose_ready' && data.session && (
        <>
          <PackedItems items={data.meal?.items_offered ?? []} total={data.meal?.total_offered_carbs} dimmed />

          <div className="bg-[#141414] rounded-2xl border border-teal-500/30 p-5 space-y-4">
            <p className="text-[10px] tracking-widest text-teal-400 font-semibold">FIRST DOSE</p>

            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold text-white">{data.session.recommended_dose_grams}g</span>
              <span className="text-gray-500 text-sm">into pump</span>
            </div>

            {data.session.engine_reasoning && (
              <p className="text-xs text-gray-400 leading-relaxed">{data.session.engine_reasoning}</p>
            )}

            <div className="bg-black/40 rounded-xl p-3 font-mono text-xs text-teal-300 space-y-1">
              <p>1. Tap Bolus on Omnipod 5</p>
              <p>2. Select Manual</p>
              <p>3. Enter <span className="font-bold text-white">{data.session.recommended_dose_grams}g carbs</span></p>
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
              {loading ? 'Saving…' : 'Dose Given ✓'}
            </button>
          </div>
        </>
      )}

      {/* ── Eating: dose given, waiting for eaten report ───────────────── */}
      {phase === 'eating' && data.session && (
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

          {eatenMode === 'idle' && (
            <div className="bg-[#141414] rounded-2xl border border-white/5 p-5 space-y-3">
              <p className="text-sm font-semibold text-white">He finished eating?</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Tell us what he ate to get the follow-up dose.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setEatenMode('manual')}
                  className="flex-1 bg-white/5 border border-white/10 text-white text-sm font-semibold py-3.5 rounded-xl active:opacity-70"
                >
                  Enter manually
                </button>
                <button
                  onClick={() => photoRef.current?.click()}
                  className="flex-1 bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold py-3.5 rounded-xl active:opacity-70"
                >
                  Take photo
                </button>
              </div>
              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>
          )}

          {eatenMode === 'manual' && data.meal && (
            <div className="bg-[#141414] rounded-2xl border border-white/5 p-5 space-y-4">
              <p className="text-[10px] tracking-widest text-gray-500 font-semibold">HOW MUCH DID HE EAT?</p>
              <div className="space-y-3">
                {data.meal.items_offered.map(item => (
                  <div key={item.name} className="flex items-center justify-between">
                    <p className="text-sm text-white flex-1 pr-3">{item.name}</p>
                    <div className="flex gap-1">
                      {(['all', 'half', 'none'] as EatenChoice[]).map(choice => (
                        <button
                          key={choice}
                          onClick={() => setEatenChoices(p => ({ ...p, [item.name]: choice }))}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                            (eatenChoices[item.name] ?? 'all') === choice
                              ? 'bg-teal-500 text-black'
                              : 'bg-white/5 text-gray-400'
                          }`}
                        >
                          {choice === 'all' ? 'All' : choice === 'half' ? 'Half' : 'None'}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={handleSubmitManual}
                disabled={loading}
                className="w-full bg-teal-500 text-black font-bold py-4 rounded-2xl active:opacity-80 disabled:opacity-50"
              >
                {loading ? 'Calculating…' : 'Get Follow-up Dose →'}
              </button>
            </div>
          )}

          {eatenMode === 'photo_processing' && (
            <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-10 text-center space-y-2">
              <p className="text-sm text-white">Analyzing photo…</p>
              <p className="text-xs text-gray-500">Claude is estimating what&apos;s left</p>
            </div>
          )}

          {eatenMode === 'photo_review' && photoEstimate && data.meal && (
            <div className="bg-[#141414] rounded-2xl border border-white/5 p-5 space-y-4">
              <p className="text-[10px] tracking-widest text-teal-400 font-semibold">PHOTO ESTIMATE</p>
              <div className="space-y-2">
                {photoEstimate.items_eaten.map((item, i) => {
                  const pct = item.qty_offered > 0
                    ? Math.round(((item.qty_eaten ?? 0) / item.qty_offered) * 100)
                    : 0
                  return (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-white">{item.name}</span>
                      <span className="text-gray-400">{pct}% eaten</span>
                    </div>
                  )
                })}
              </div>
              {photoEstimate.notes && (
                <p className="text-xs text-gray-500 italic">{photoEstimate.notes}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { setEatenMode('manual'); setPhotoEstimate(null) }}
                  className="flex-1 bg-white/5 border border-white/10 text-gray-400 text-sm py-3 rounded-xl"
                >
                  Adjust
                </button>
                <button
                  onClick={handleConfirmPhoto}
                  disabled={loading}
                  className="flex-1 bg-teal-500 text-black font-bold py-3 rounded-xl active:opacity-80 disabled:opacity-50"
                >
                  {loading ? 'Saving…' : 'Looks right ✓'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Follow-up pending (calculating) ───────────────────────────── */}
      {phase === 'followup_pending' && (
        <div className="bg-[#141414] rounded-2xl border border-white/5 px-5 py-10 text-center space-y-2">
          <p className="text-sm text-white">Calculating follow-up dose…</p>
        </div>
      )}

      {/* ── Follow-up ready ────────────────────────────────────────────── */}
      {phase === 'followup_ready' && data.followUpSession && (
        <>
          {data.meal?.items_eaten && (
            <EatenSummary items={data.meal.items_eaten as MealItem[]} />
          )}

          {data.followUpSession.recommended_dose_grams === 0 ? (
            <div className="bg-[#141414] rounded-2xl border border-teal-500/20 p-5 space-y-3">
              <p className="text-[10px] tracking-widest text-teal-400 font-semibold">NO FOLLOW-UP NEEDED</p>
              <p className="text-sm text-gray-300 leading-relaxed">{data.followUpSession.engine_reasoning}</p>
              <button
                onClick={handleConfirmFollowUp}
                disabled={loading}
                className="w-full bg-white/5 border border-white/10 text-gray-300 font-semibold py-3.5 rounded-xl disabled:opacity-50"
              >
                Got it — Done
              </button>
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
                {loading ? 'Saving…' : 'Follow-up Given ✓'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Complete ───────────────────────────────────────────────────── */}
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
                <span className="text-gray-500">Pre-bolus</span>
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
                <span className="text-gray-500">Follow-up</span>
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

// ── Sub-components ────────────────────────────────────────────────────────────

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
