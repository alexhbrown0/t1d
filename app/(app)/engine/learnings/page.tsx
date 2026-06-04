'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Suggestion {
  param: string
  current: number
  suggested: number
  confidence: 'high' | 'medium' | 'low'
  rationale: string
}

interface Learning {
  id: string
  learning_date: string
  claude_observations: string
  claude_suggestions: Suggestion[]
  data_quality: string
  action_taken: string | null
}

const PARAM_LABELS: Record<string, string> = {
  pre_bolus_pct: 'Pre-bolus %',
  pre_bolus_lead_min: 'Pre-bolus lead time (min)',
  activity_reduction_pct: 'Activity reduction %',
  fpu_insulin_factor: 'FPU insulin factor',
  low_carryover_reduction_pct: 'Low carryover reduction %',
  current_icr: 'ICR (g/unit)',
  current_isf: 'ISF',
}

function SuggestionCard({
  s,
  onApprove,
  onReject,
  done,
}: {
  s: Suggestion
  onApprove: () => void
  onReject: () => void
  done: boolean
}) {
  const pct = s.param.includes('pct') || s.param === 'pre_bolus_pct'
  const fmt = (v: number) => pct ? `${(v * 100).toFixed(0)}%` : String(v)
  const up = s.suggested > s.current
  const confidenceColor = s.confidence === 'high' ? 'text-teal-400' : s.confidence === 'medium' ? 'text-yellow-400' : 'text-gray-500'

  return (
    <div className={`bg-[#141414] rounded-2xl border p-4 space-y-3 ${done ? 'opacity-50 border-white/5' : 'border-white/10'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] tracking-widest text-gray-500 font-semibold">{PARAM_LABELS[s.param] ?? s.param}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-lg font-bold text-white">{fmt(s.current)}</span>
            <span className="text-gray-600">→</span>
            <span className={`text-lg font-bold ${up ? 'text-yellow-400' : 'text-teal-400'}`}>{fmt(s.suggested)}</span>
          </div>
        </div>
        <span className={`text-[10px] font-semibold ${confidenceColor}`}>{s.confidence} confidence</span>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{s.rationale}</p>
      {!done && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={onApprove}
            className="flex-1 bg-teal-500/15 border border-teal-500/30 text-teal-300 text-xs font-semibold py-2 rounded-xl"
          >
            Approve
          </button>
          <button
            onClick={onReject}
            className="flex-1 bg-white/5 border border-white/10 text-gray-400 text-xs font-semibold py-2 rounded-xl"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

export default function LearningsPage() {
  const router = useRouter()
  const [learnings, setLearnings] = useState<Learning[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null)
  const [acted, setActed] = useState<Record<string, 'approved' | 'rejected'>>({})

  const loadLearnings = () => {
    fetch('/api/t1d/learnings')
      .then(r => r.json())
      .then(data => { setLearnings(data ?? []); setLoading(false) })
  }

  useEffect(() => { loadLearnings() }, [])

  const triggerLearning = async () => {
    setTriggering(true)
    setTriggerMsg(null)
    await fetch('/api/t1d/learnings/run', { method: 'POST' })
    setTriggering(false)
    setTriggerMsg('Analysis running — takes ~60s. Page will refresh automatically.')
    setTimeout(() => { setTriggerMsg(null); loadLearnings() }, 75000)
  }

  const approve = async (learningId: string, s: Suggestion) => {
    const key = `${learningId}-${s.param}`
    setActed(prev => ({ ...prev, [key]: 'approved' }))
    await fetch('/api/t1d/engine-params', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [s.param]: s.suggested }),
    })
    await fetch('/api/t1d/learnings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: learningId, action_taken: 'approved' }),
    })
  }

  const reject = (learningId: string, s: Suggestion) => {
    const key = `${learningId}-${s.param}`
    setActed(prev => ({ ...prev, [key]: 'rejected' }))
  }

  return (
    <div className="px-4 pt-5 pb-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex-1">
          <p className="text-[10px] tracking-widest text-gray-500 font-semibold">ENGINE</p>
          <p className="text-lg font-semibold text-white">Daily Learnings</p>
        </div>
        <button
          onClick={triggerLearning}
          disabled={triggering}
          className="text-xs text-teal-400 bg-teal-500/10 border border-teal-500/20 px-3 py-1.5 rounded-full disabled:opacity-40"
        >
          {triggering ? 'Running...' : 'Run now'}
        </button>
      </div>

      {triggerMsg && (
        <div className="bg-teal-500/5 border border-teal-500/20 rounded-xl px-4 py-3">
          <p className="text-xs text-teal-400">{triggerMsg}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-24 bg-white/5 rounded-2xl animate-pulse" />)}
        </div>
      ) : learnings.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 text-sm">No learnings yet.</p>
          <p className="text-gray-700 text-xs mt-1">Tap "Run now" after a full day of data.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {learnings.map(l => (
            <div key={l.id} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <p className="text-[10px] tracking-widest text-gray-500 font-semibold">
                  {new Date(l.learning_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
                {l.data_quality && (
                  <p className="text-[10px] text-gray-600">{l.data_quality}</p>
                )}
              </div>

              <div className="bg-[#141414] rounded-2xl border border-white/5 px-4 py-3">
                <p className="text-[10px] tracking-widest text-gray-500 font-semibold mb-2">OBSERVATIONS</p>
                <p className="text-sm text-gray-300 leading-relaxed">{l.claude_observations}</p>
              </div>

              {l.claude_suggestions?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] tracking-widest text-gray-500 font-semibold px-1">SUGGESTED CHANGES</p>
                  {l.claude_suggestions.map((s, i) => {
                    const key = `${l.id}-${s.param}`
                    return (
                      <SuggestionCard
                        key={i}
                        s={s}
                        onApprove={() => approve(l.id, s)}
                        onReject={() => reject(l.id, s)}
                        done={!!acted[key]}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
