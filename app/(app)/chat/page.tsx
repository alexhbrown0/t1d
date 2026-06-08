'use client'

import { useState, useEffect, useRef } from 'react'

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  photo_url?: string | null
}

const QUICK_REPLIES = [
  'Plan lunch',
  'Plan snack',
  'We gave him a juice box',
  'He just started eating',
  'He refused to eat',
  'Giving a correction now',
  'Recess is 30 min early',
]

const QUICK_REPLY_MESSAGES: Record<string, string> = {
  'Plan lunch': "I'm planning Brooks's lunch. Give me carb estimates as I describe or photo what I'm packing — planning mode only, not dosing yet.",
  'Plan snack': "I'm planning a snack for Brooks. Give me carb estimates only — planning mode, not dosing yet.",
}

function TrendArrow({ trend }: { trend: string | null }) {
  const arrows: Record<string, string> = {
    rising: '↑', risingQuickly: '↑↑', fallingQuickly: '↓↓', falling: '↓',
    steady: '→', none: '–',
  }
  return <span>{arrows[trend ?? 'none'] ?? '→'}</span>
}

function NoteProposalCard({
  text,
  onSave,
  onDismiss,
}: {
  text: string
  onSave: (text: string) => void
  onDismiss: () => void
}) {
  const [draft, setDraft] = useState(text)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    await onSave(draft)
    setSaving(false)
  }

  return (
    <div className="mx-1 mt-2 bg-teal-950/40 border border-teal-500/30 rounded-2xl p-4 space-y-3">
      <p className="text-[10px] tracking-widest text-teal-400 font-semibold">CLINICAL NOTE READY TO SAVE</p>
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        rows={4}
        className="w-full bg-transparent text-sm text-gray-200 leading-relaxed resize-none outline-none border border-white/10 rounded-xl px-3 py-2"
      />
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving || !draft.trim()}
          className="flex-1 bg-teal-500/20 text-teal-400 text-xs font-semibold py-2 rounded-xl disabled:opacity-40 active:bg-teal-500/30"
        >
          {saving ? 'Saving…' : 'Save note'}
        </button>
        <button
          onClick={onDismiss}
          className="px-4 text-gray-500 text-xs py-2 rounded-xl active:bg-white/5"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

interface LogProposal {
  type: 'low_treatment' | 'dose'
  display: string
  treatment_type?: string
  treatment_carbs_g?: number | null
  bg_at_treatment?: number | null
  dose_grams?: number | null
  timestamp: string
}

function LogProposalCard({ proposal, onConfirm, onDismiss }: {
  proposal: LogProposal
  onConfirm: () => void
  onDismiss: () => void
}) {
  const [logging, setLogging] = useState(false)
  const isLow = proposal.type === 'low_treatment'

  const confirm = async () => {
    setLogging(true)
    await onConfirm()
    setLogging(false)
  }

  return (
    <div className={`mx-1 mt-2 rounded-2xl p-4 space-y-3 border ${isLow ? 'bg-red-950/30 border-red-500/30' : 'bg-blue-950/30 border-blue-500/30'}`}>
      <p className={`text-[10px] tracking-widest font-semibold ${isLow ? 'text-red-400' : 'text-blue-400'}`}>
        {isLow ? 'LOG LOW TREATMENT' : 'LOG DOSE'}
      </p>
      <div className="space-y-1">
        <p className="text-sm text-white font-medium">{proposal.display}</p>
        <p className="text-xs text-gray-500">Tap after you do it — timestamp will be recorded at that moment</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={confirm}
          disabled={logging}
          className={`flex-1 text-xs font-semibold py-2 rounded-xl disabled:opacity-40 ${isLow ? 'bg-red-500/20 text-red-400 active:bg-red-500/30' : 'bg-blue-500/20 text-blue-400 active:bg-blue-500/30'}`}
        >
          {logging ? 'Logging…' : 'Done — log it'}
        </button>
        <button onClick={onDismiss} className="px-4 text-gray-500 text-xs py-2 rounded-xl active:bg-white/5">
          Dismiss
        </button>
      </div>
    </div>
  )
}

interface LunchPlan {
  items: { name: string; qty: string; carbs_g: number }[]
  total_carbs_g: number
  notes?: string | null
}

function LunchPlanCard({ plan, onSave, onDismiss }: {
  plan: LunchPlan
  onSave: () => void
  onDismiss: () => void
}) {
  const [saving, setSaving] = useState(false)
  const save = async () => { setSaving(true); await onSave(); setSaving(false) }

  return (
    <div className="mx-1 mt-2 bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 space-y-3">
      <p className="text-[10px] tracking-widest text-amber-400 font-semibold">SAVE TODAY'S LUNCH PLAN</p>
      <div className="space-y-1">
        {plan.items.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-300">{item.name} <span className="text-gray-500 text-xs">{item.qty}</span></span>
            <span className="text-amber-400 font-medium text-xs">{item.carbs_g}g</span>
          </div>
        ))}
        <div className="flex justify-between text-sm border-t border-white/10 pt-2 mt-2">
          <span className="text-white font-semibold">Total</span>
          <span className="text-amber-300 font-bold">{plan.total_carbs_g}g carbs</span>
        </div>
        {plan.notes && <p className="text-xs text-gray-500 italic">{plan.notes}</p>}
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="flex-1 bg-amber-500/20 text-amber-400 text-xs font-semibold py-2 rounded-xl disabled:opacity-40 active:bg-amber-500/30">
          {saving ? 'Saving…' : 'Save lunch plan'}
        </button>
        <button onClick={onDismiss} className="px-4 text-gray-500 text-xs py-2 rounded-xl active:bg-white/5">Dismiss</button>
      </div>
    </div>
  )
}

interface RecipeProposal {
  name: string
  yield_count?: number | null
  yield_unit?: string | null
  carbs_per_piece?: number | null
  fat_per_piece?: number | null
  protein_per_piece?: number | null
  carbs_per_100g?: number | null
  fat_per_100g?: number | null
  protein_per_100g?: number | null
  typical_serving_g?: number | null
  typical_serving_description?: string | null
  gi_category?: string | null
  notes?: string | null
}

function RecipeProposalCard({ recipe, onSave, onDismiss }: {
  recipe: RecipeProposal
  onSave: () => void
  onDismiss: () => void
}) {
  const [saving, setSaving] = useState(false)
  const hasPiece = recipe.carbs_per_piece != null
  const has100g = recipe.carbs_per_100g != null

  const save = async () => {
    setSaving(true)
    await onSave()
    setSaving(false)
  }

  return (
    <div className="mx-1 mt-2 bg-green-950/30 border border-green-500/30 rounded-2xl p-4 space-y-3">
      <p className="text-[10px] tracking-widest text-green-400 font-semibold">SAVE RECIPE</p>
      <div className="space-y-1">
        <p className="text-sm text-white font-semibold">{recipe.name}</p>
        {hasPiece && <p className="text-xs text-gray-400">{recipe.carbs_per_piece}g carbs per {recipe.yield_unit?.replace(/s$/, '') ?? 'piece'}{recipe.yield_count ? ` · makes ${recipe.yield_count} ${recipe.yield_unit}` : ''}</p>}
        {has100g && <p className="text-xs text-gray-400">{recipe.carbs_per_100g}g carbs per 100g{recipe.typical_serving_g ? ` · typical serving ~${recipe.typical_serving_g}g` : ''}</p>}
        {recipe.gi_category && <p className="text-xs text-gray-500">{recipe.gi_category} GI</p>}
        {recipe.notes && <p className="text-xs text-gray-500 italic">{recipe.notes}</p>}
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="flex-1 bg-green-500/20 text-green-400 text-xs font-semibold py-2 rounded-xl disabled:opacity-40 active:bg-green-500/30">
          {saving ? 'Saving…' : 'Save recipe'}
        </button>
        <button onClick={onDismiss} className="px-4 text-gray-500 text-xs py-2 rounded-xl active:bg-white/5">Dismiss</button>
      </div>
    </div>
  )
}

interface FoodProposal {
  name: string
  serving_size: string
  carbs_g: number
  fat_g?: number | null
  protein_g?: number | null
  gi_category?: string | null
  category?: string | null
}

function FoodProposalCard({ food, onSave, onDismiss }: {
  food: FoodProposal
  onSave: (f: FoodProposal) => void
  onDismiss: () => void
}) {
  const [draft, setDraft] = useState(food)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    await onSave(draft)
    setSaving(false)
  }

  return (
    <div className="mx-1 mt-2 bg-violet-950/30 border border-violet-500/30 rounded-2xl p-4 space-y-3">
      <p className="text-[10px] tracking-widest text-violet-400 font-semibold">ADD TO FOOD LIST</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-[10px] text-gray-500 font-semibold">NAME</label>
          <input
            value={draft.name}
            onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
            className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 font-semibold">SERVING SIZE</label>
          <input
            value={draft.serving_size}
            onChange={e => setDraft(p => ({ ...p, serving_size: e.target.value }))}
            className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 font-semibold">CARBS (g)</label>
          <input
            type="number"
            value={draft.carbs_g}
            onChange={e => setDraft(p => ({ ...p, carbs_g: parseFloat(e.target.value) || 0 }))}
            className="block w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1 outline-none"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !draft.name || !draft.carbs_g} className="flex-1 bg-violet-500/20 text-violet-400 text-xs font-semibold py-2 rounded-xl disabled:opacity-40 active:bg-violet-500/30">
          {saving ? 'Saving…' : 'Save to food list'}
        </button>
        <button onClick={onDismiss} className="px-4 text-gray-500 text-xs py-2 rounded-xl active:bg-white/5">Dismiss</button>
      </div>
    </div>
  )
}

interface Photo {
  preview: string
  base64: string
  mimeType: string
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [bg, setBg] = useState<{ value: number | null; trend: string | null } | null>(null)
  const [proposal, setProposal] = useState<string | null>(null)
  const [logProposal, setLogProposal] = useState<LogProposal | null>(null)
  const [recipeProposal, setRecipeProposal] = useState<RecipeProposal | null>(null)
  const [foodProposal, setFoodProposal] = useState<FoodProposal | null>(null)
  const [lunchPlan, setLunchPlan] = useState<LunchPlan | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const autoSentRef = useRef(false)
  const photoRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handlePhotoFile = async (file: File) => {
    const preview = URL.createObjectURL(file)
    const base64 = await toBase64(file)
    setPhotos(prev => [...prev, { preview, base64, mimeType: file.type || 'image/jpeg' }])
  }

  const removePhoto = (idx: number) => setPhotos(prev => prev.filter((_, i) => i !== idx))

  useEffect(() => {
    fetch('/api/t1d/chat').then(r => r.json()).then(data => {
      setMessages([...data].reverse())

      if (!autoSentRef.current) {
        const params = new URLSearchParams(window.location.search)
        const q = params.get('q')
        if (q) {
          autoSentRef.current = true
          window.history.replaceState({}, '', '/chat')
          setTimeout(() => send(q), 100)
        }
      }
    })
    fetch('/api/ingest/dexcom').catch(() => null)
  }, [])

  useEffect(() => {
    fetch('/api/t1d/bg-latest').then(r => r.json()).then(data => {
      if (data?.value_mgdl) setBg({ value: data.value_mgdl, trend: data.trend })
    }).catch(() => null)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, proposal, lunchPlan, logProposal, recipeProposal])

  const send = async (text: string, attachedPhotos?: Photo[]) => {
    const currentPhotos = attachedPhotos ?? photos
    if (!text.trim() && currentPhotos.length === 0 || loading) return
    const displayText = text.trim() || ''
    const previewUrl = currentPhotos.length === 1
      ? currentPhotos[0].preview
      : currentPhotos.length > 1
        ? JSON.stringify(currentPhotos.map(p => p.preview))
        : null
    const optimistic: ChatMsg = { id: Date.now().toString(), role: 'user', content: displayText, created_at: new Date().toISOString(), photo_url: previewUrl }
    setMessages(prev => [...prev, optimistic])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setPhotos([])
    setProposal(null)
    setLogProposal(null)
    setRecipeProposal(null)
    setFoodProposal(null)
    setLunchPlan(null)
    setLoading(true)
    try {
      const body: Record<string, unknown> = { message: text.trim() || '' }
      if (currentPhotos.length > 0) {
        body.photos = currentPhotos.map(p => ({ base64: p.base64, mime_type: p.mimeType }))
      }
      const res = await fetch('/api/t1d/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const { userMsg, assistantMsg, proposal: newProposal, log_proposal: newLogProposal, recipe_proposal: newRecipeProposal, food_proposal: newFoodProposal, lunch_plan: newLunchPlan } = await res.json()
      setMessages(prev => [...prev.filter(m => m.id !== optimistic.id), userMsg, assistantMsg])
      if (newProposal) setProposal(newProposal)
      if (newLogProposal) setLogProposal(newLogProposal as LogProposal)
      if (newRecipeProposal) setRecipeProposal(newRecipeProposal as RecipeProposal)
      if (newFoodProposal) setFoodProposal(newFoodProposal as FoodProposal)
      if (newLunchPlan) setLunchPlan(newLunchPlan as LunchPlan)
    } finally {
      setLoading(false)
    }
  }

  const confirmLog = async () => {
    if (!logProposal) return
    const timestamp = new Date().toISOString()
    if (logProposal.type === 'low_treatment') {
      await fetch('/api/t1d/low-treatments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp,
          treatment_type: logProposal.treatment_type ?? 'other',
          treatment_carbs_g: logProposal.treatment_carbs_g ?? null,
          source: 'chat',
        }),
      })
    } else if (logProposal.type === 'dose') {
      await fetch('/api/t1d/dose-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp,
          recommended_dose_grams: logProposal.dose_grams ?? null,
          context: 'chat',
          entered_by: 'alexandra',
        }),
      })
    }
    setLogProposal(null)
    const confirmed: ChatMsg = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `Logged: ${logProposal.display}`,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, confirmed])
  }

  const saveLunchPlan = async () => {
    if (!lunchPlan) return
    await fetch('/api/t1d/meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: 'school_lunch',
        source: 'chat',
        entered_by: 'alexandra',
        items: lunchPlan.items.map(item => ({
          food_repo_id: null,
          name: item.name,
          qty_offered: 1,
          qty_eaten: null,
          carbs: item.carbs_g,
          fat: null,
          protein: null,
        })),
      }),
    })
    setLunchPlan(null)
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'assistant',
      content: `Lunch plan saved — ${lunchPlan.total_carbs_g}g total carbs. You can share this with the nurse when it's time.`,
      created_at: new Date().toISOString(),
    }])
  }

  const saveRecipe = async () => {
    if (!recipeProposal) return
    await fetch('/api/t1d/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recipeProposal),
    })
    setRecipeProposal(null)
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'assistant',
      content: `Recipe saved: ${recipeProposal.name}. I'll use it for dosing whenever you mention it.`,
      created_at: new Date().toISOString(),
    }])
  }

  const saveFood = async (f: FoodProposal) => {
    await fetch('/api/t1d/food-repo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, serving_qty: 1, category: f.category ?? 'snack' }),
    })
    setFoodProposal(null)
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'assistant',
      content: `${f.name} added to the food list (${f.carbs_g}g carbs per ${f.serving_size}).`,
      created_at: new Date().toISOString(),
    }])
  }

  const saveNote = async (text: string) => {
    await fetch('/api/t1d/engine-params', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinical_notes: text }),
    })
    setProposal(null)
    // Confirm in chat
    const saved: ChatMsg = {
      id: Date.now().toString(),
      role: 'assistant',
      content: 'Clinical note saved. I\'ll apply this going forward.',
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, saved])
  }

  const bgSubtitle = bg?.value
    ? `Brooks · ${bg.value} mg/dL `
    : 'Brooks · –'

  return (
    <div
      className="flex flex-col bg-[#0a0a0a]"
      style={{
        position: 'fixed',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 512,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 50px)',
        zIndex: 10,
      }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/5 flex-none">
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold">ASSIST</p>
        <p className="text-sm text-gray-400 mt-0.5">
          {bgSubtitle}
          {bg?.trend && <TrendArrow trend={bg.trend} />}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="text-center mt-12">
            <p className="text-gray-600 text-sm">Ask me anything about Brooks.</p>
            <p className="text-gray-700 text-xs mt-1">Dosing, lows, activity, what to do next.</p>
          </div>
        )}
        {messages.map((m) => {
          const msgPhotoUrls: string[] = m.photo_url
            ? (() => { try { const p = JSON.parse(m.photo_url); return Array.isArray(p) ? p : [m.photo_url] } catch { return [m.photo_url] } })()
            : []
          const bodyText = m.content?.replace(/^\[photos?\]\s*/, '') || ''
          return (
            <div key={m.id} className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] min-w-0 rounded-2xl overflow-hidden ${
                m.role === 'user'
                  ? 'bg-white/10 text-white rounded-br-sm'
                  : 'bg-[#141414] text-gray-200 border border-white/5 rounded-bl-sm'
              }`}>
                {msgPhotoUrls.length > 0 && (
                  <div className={msgPhotoUrls.length > 1 ? 'grid grid-cols-2 gap-px' : ''}>
                    {msgPhotoUrls.map((url, i) => (
                      <button key={i} onClick={() => setLightbox(url)} className="block w-full">
                        <img src={url} alt="attached" className="w-full max-h-48 object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                {(bodyText && bodyText !== '[photo]') && (
                  <p className="px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap">
                    {bodyText}
                  </p>
                )}
              </div>
            </div>
          )
        })}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#141414] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        {recipeProposal && (
          <RecipeProposalCard
            recipe={recipeProposal}
            onSave={saveRecipe}
            onDismiss={() => setRecipeProposal(null)}
          />
        )}
        {foodProposal && (
          <FoodProposalCard
            food={foodProposal}
            onSave={saveFood}
            onDismiss={() => setFoodProposal(null)}
          />
        )}
        {lunchPlan && (
          <LunchPlanCard
            plan={lunchPlan}
            onSave={saveLunchPlan}
            onDismiss={() => setLunchPlan(null)}
          />
        )}
        {logProposal && (
          <LogProposalCard
            proposal={logProposal}
            onConfirm={confirmLog}
            onDismiss={() => setLogProposal(null)}
          />
        )}
        {proposal && (
          <NoteProposalCard
            text={proposal}
            onSave={saveNote}
            onDismiss={() => setProposal(null)}
          />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick replies */}
      <div className="flex-none pb-2">
      <div className="px-4 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
        {QUICK_REPLIES.map(r => (
          <button
            key={r}
            onClick={() => send(QUICK_REPLY_MESSAGES[r] ?? r)}
            disabled={loading}
            className="whitespace-nowrap text-xs bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-gray-400 flex-shrink-0 active:bg-white/10"
          >
            {r}
          </button>
        ))}
      </div>
      </div>

      {/* Photo previews */}
      {photos.length > 0 && (
        <div className="px-4 pb-1 flex-none flex gap-2 flex-wrap">
          {photos.map((p, i) => (
            <div key={i} className="relative">
              <img src={p.preview} alt="attached" className="h-20 w-20 rounded-xl object-cover border border-white/10" />
              <button
                onClick={() => removePhoto(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-800 border border-white/20 flex items-center justify-center text-gray-400 text-xs"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* File input — outside flex layout to prevent iOS capture attribute from adding width */}
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        multiple
        style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: 1, height: 1, opacity: 0 }}
        onChange={e => { Array.from(e.target.files ?? []).forEach(f => handlePhotoFile(f)); e.target.value = '' }}
      />

      {/* Input bar */}
      <div className="px-4 pb-4 pt-1 flex-none">
        <div className="flex gap-2 items-center bg-[#141414] border border-white/10 rounded-2xl px-3 py-3">
          {/* Add food button */}
          <button
            onClick={() => setFoodProposal({ name: '', serving_size: '1 serving', carbs_g: 0 })}
            disabled={loading}
            className="text-gray-500 flex-shrink-0 active:text-violet-400 transition-colors"
            title="Add food to list"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </button>
          {/* Camera button */}
          <button
            onClick={() => photoRef.current?.click()}
            disabled={loading}
            className="text-gray-500 flex-shrink-0 active:text-teal-400 transition-colors relative"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            {photos.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-teal-500 text-black text-[9px] font-bold flex items-center justify-center leading-none">
                {photos.length}
              </span>
            )}
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = `${e.target.scrollHeight}px`
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
                e.currentTarget.style.height = 'auto'
              }
            }}
            placeholder={photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? 's' : ''} ready — add a note or just send…` : 'Ask or send an update…'}
            className="flex-1 min-w-0 bg-transparent text-base text-white placeholder-gray-600 outline-none resize-none leading-normal"
            style={{ maxHeight: '8rem', overflowY: 'auto' }}
          />
          <button
            onClick={() => send(input)}
            disabled={(!input.trim() && photos.length === 0) || loading}
            className="text-teal-400 disabled:text-gray-700 flex-shrink-0 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <button
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
        >
          <img src={lightbox} alt="full size" className="max-w-full max-h-full object-contain" />
        </button>
      )}
    </div>
  )
}
