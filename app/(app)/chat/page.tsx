'use client'

import { useState, useEffect, useRef } from 'react'

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

const QUICK_REPLIES = [
  'We gave him a juice box',
  'Recess is 30 min early',
  'He just started eating',
  'He refused to eat',
  'Giving a correction now',
]

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
  const [photo, setPhoto] = useState<Photo | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const autoSentRef = useRef(false)
  const photoRef = useRef<HTMLInputElement>(null)

  const handlePhotoFile = async (file: File) => {
    const preview = URL.createObjectURL(file)
    const base64 = await toBase64(file)
    setPhoto({ preview, base64, mimeType: file.type || 'image/jpeg' })
  }

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
  }, [messages, proposal])

  const send = async (text: string, attachedPhoto?: Photo) => {
    const currentPhoto = attachedPhoto ?? photo
    if (!text.trim() && !currentPhoto || loading) return
    const displayText = text.trim() || '📷 Photo'
    const optimistic: ChatMsg = { id: Date.now().toString(), role: 'user', content: displayText, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, optimistic])
    setInput('')
    setPhoto(null)
    setProposal(null)
    setLoading(true)
    try {
      const body: Record<string, string> = { message: text.trim() || '' }
      if (currentPhoto) {
        body.photo_base64 = currentPhoto.base64
        body.photo_mime_type = currentPhoto.mimeType
      }
      const res = await fetch('/api/t1d/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const { userMsg, assistantMsg, proposal: newProposal } = await res.json()
      setMessages(prev => [...prev.filter(m => m.id !== optimistic.id), userMsg, assistantMsg])
      if (newProposal) setProposal(newProposal)
    } finally {
      setLoading(false)
    }
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
    <div className="flex flex-col h-full">
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
        {messages.map((m) => (
          <div key={m.id} className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] min-w-0 rounded-2xl px-4 py-3 text-sm leading-relaxed break-words overflow-hidden ${
              m.role === 'user'
                ? 'bg-white/10 text-white rounded-br-sm'
                : 'bg-[#141414] text-gray-200 border border-white/5 rounded-bl-sm'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
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
            onClick={() => send(r)}
            disabled={loading}
            className="whitespace-nowrap text-xs bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-gray-400 flex-shrink-0 active:bg-white/10"
          >
            {r}
          </button>
        ))}
      </div>
      </div>

      {/* Photo preview */}
      {photo && (
        <div className="px-4 pb-1 flex-none">
          <div className="relative inline-block">
            <img src={photo.preview} alt="attached" className="h-20 rounded-xl object-cover border border-white/10" />
            <button
              onClick={() => setPhoto(null)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-800 border border-white/20 flex items-center justify-center text-gray-400 text-xs"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* File input — outside flex layout to prevent iOS capture attribute from adding width */}
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: 1, height: 1, opacity: 0 }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f); e.target.value = '' }}
      />

      {/* Input bar */}
      <div className="px-4 pb-4 pt-1 flex-none">
        <div className="flex gap-2 items-center bg-[#141414] border border-white/10 rounded-2xl px-3 py-3">
          {/* Camera button */}
          <button
            onClick={() => photoRef.current?.click()}
            disabled={loading}
            className="text-gray-500 flex-shrink-0 active:text-teal-400 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
            placeholder={photo ? 'Add a note or just send…' : 'Ask or send an update…'}
            className="flex-1 min-w-0 bg-transparent text-base text-white placeholder-gray-600 outline-none"
          />
          <button
            onClick={() => send(input)}
            disabled={(!input.trim() && !photo) || loading}
            className="text-teal-400 disabled:text-gray-700 flex-shrink-0 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
