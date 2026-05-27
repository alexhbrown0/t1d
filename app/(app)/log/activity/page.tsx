'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const WHEN_OPTIONS = ['Just finished', 'Happening now', 'In < 30 min'] as const
type WhenOption = typeof WHEN_OPTIONS[number]

interface ActivityType {
  id: string
  label: string
  icon: React.ReactNode
}

const ACTIVITIES: ActivityType[] = [
  {
    id: 'pe',
    label: 'PE',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="1" fill="currentColor" />
        <path d="M9 20l3-8 3 8M6 13l3-3 3 1 3-3" />
      </svg>
    ),
  },
  {
    id: 'run',
    label: 'Run',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="13" cy="4" r="1" />
        <path d="M5.5 21l4-8 2.5 2.5 2-4 4.5 4" />
        <path d="M12.5 7l-3 5 2.5 2L14 10" />
      </svg>
    ),
  },
  {
    id: 'swim',
    label: 'Swim',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12c.6.5 1.2 1 2.5 1C7 13 7 11 9.5 11s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" />
        <path d="M2 18c.6.5 1.2 1 2.5 1C7 19 7 17 9.5 17s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" />
        <circle cx="15" cy="6" r="2" />
        <path d="M10 6.5l2-2 4 2 2-2.5" />
      </svg>
    ),
  },
  {
    id: 'bike',
    label: 'Bike',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5.5" cy="17.5" r="3.5" />
        <circle cx="18.5" cy="17.5" r="3.5" />
        <path d="M15 6a1 1 0 0 0-1-1h-1l-5 9h9l-5-9" />
        <path d="M12 6v5l3 3" />
      </svg>
    ),
  },
  {
    id: 'recess',
    label: 'Recess',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8c-2 2-2 5 0 7s5 2 7 0" />
        <path d="M12 8c2 2 2 5 0 7s-5 2-7 0" />
        <line x1="12" y1="8" x2="12" y2="2" />
      </svg>
    ),
  },
  {
    id: 'other',
    label: 'Other',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="19" cy="12" r="1" fill="currentColor" />
        <circle cx="5" cy="12" r="1" fill="currentColor" />
      </svg>
    ),
  },
]

const INTENSITY = ['Light', 'Moderate', 'Intense'] as const

export default function LogActivityPage() {
  const router = useRouter()
  const [when, setWhen] = useState<WhenOption>('Just finished')
  const [activityId, setActivityId] = useState<string | null>(null)
  const [duration, setDuration] = useState(30)
  const [intensity, setIntensity] = useState<'Light' | 'Moderate' | 'Intense'>('Moderate')
  const [submitting, setSubmitting] = useState(false)

  const durationLabel = duration >= 60
    ? `${Math.floor(duration / 60)}h ${duration % 60 > 0 ? `${duration % 60}m` : ''}`
    : `${duration}m`

  const submit = async () => {
    if (!activityId) return
    setSubmitting(true)
    await fetch('/api/t1d/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        when,
        activity_type: activityId,
        duration_minutes: duration,
        intensity,
      }),
    }).catch(() => null)
    router.push('/now')
  }

  return (
    <div className="px-4 pt-5 pb-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <p className="text-[10px] tracking-widest text-green-400 font-semibold">LOG ACTIVITY</p>
          <p className="text-lg font-semibold text-white">Log Movement</p>
        </div>
      </div>

      {/* When */}
      <div>
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold mb-2">WHEN</p>
        <div className="flex gap-2">
          {WHEN_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => setWhen(opt)}
              className={`flex-1 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                when === opt
                  ? 'border-green-500/40 bg-green-500/10 text-green-300'
                  : 'border-white/10 bg-[#141414] text-gray-500'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* What */}
      <div>
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold mb-2">WHAT</p>
        <div className="grid grid-cols-3 gap-2">
          {ACTIVITIES.map(a => (
            <button
              key={a.id}
              onClick={() => setActivityId(a.id)}
              className={`rounded-xl border py-3 flex flex-col items-center gap-1.5 transition-colors ${
                activityId === a.id
                  ? 'border-green-500/40 bg-green-500/10 text-green-400'
                  : 'border-white/10 bg-[#141414] text-gray-500'
              }`}
            >
              {a.icon}
              <span className="text-xs font-semibold">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div>
        <div className="flex justify-between mb-2">
          <p className="text-[10px] tracking-widest text-gray-500 font-semibold">DURATION</p>
          <p className="text-sm font-semibold text-white">{durationLabel}</p>
        </div>
        <input
          type="range"
          min={5}
          max={120}
          step={5}
          value={duration}
          onChange={e => setDuration(Number(e.target.value))}
          className="w-full accent-teal-400"
        />
        <div className="flex justify-between mt-1 text-[10px] text-gray-700">
          <span>5m</span>
          <span>2h</span>
        </div>
      </div>

      {/* Intensity */}
      <div>
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold mb-2">INTENSITY</p>
        <div className="grid grid-cols-3 gap-2">
          {INTENSITY.map(level => (
            <button
              key={level}
              onClick={() => setIntensity(level)}
              className={`py-3 rounded-xl border text-xs font-semibold transition-colors ${
                intensity === level
                  ? 'border-green-500/40 bg-green-500/10 text-green-300'
                  : 'border-white/10 bg-[#141414] text-gray-500'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* Log button */}
      <button
        onClick={submit}
        disabled={!activityId || submitting}
        className="w-full bg-green-500/10 border border-green-500/20 text-green-300 font-semibold py-4 rounded-2xl text-sm disabled:opacity-40"
      >
        {submitting ? 'Logging...' : 'Log Activity'}
      </button>
    </div>
  )
}
