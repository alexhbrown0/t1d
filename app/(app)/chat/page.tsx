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

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [bg, setBg] = useState<{ value: number | null; trend: string | null } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const autoSentRef = useRef(false)

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
  }, [messages])

  const send = async (text: string) => {
    if (!text.trim() || loading) return
    const optimistic: ChatMsg = { id: Date.now().toString(), role: 'user', content: text, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, optimistic])
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/t1d/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const { userMsg, assistantMsg } = await res.json()
      setMessages(prev => [...prev.filter(m => m.id !== optimistic.id), userMsg, assistantMsg])
    } finally {
      setLoading(false)
    }
  }

  const bgSubtitle = bg?.value
    ? `Brooks · ${bg.value} mg/dL `
    : 'Brooks · –'

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 80px)' }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b border-white/5 flex-shrink-0">
        <p className="text-[10px] tracking-widest text-gray-500 font-semibold">ASSIST</p>
        <p className="text-sm text-gray-400 mt-0.5">
          {bgSubtitle}
          {bg?.trend && <TrendArrow trend={bg.trend} />}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="text-center mt-12">
            <p className="text-gray-600 text-sm">Ask me anything about Brooks.</p>
            <p className="text-gray-700 text-xs mt-1">Dosing, lows, activity, what to do next.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
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
        <div ref={bottomRef} />
      </div>

      {/* Quick replies */}
      <div className="px-4 pb-2 flex gap-2 overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: 'none' }}>
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

      {/* Input bar */}
      <div className="px-4 pb-4 pt-1 flex-shrink-0">
        <div className="flex gap-3 items-center bg-[#141414] border border-white/10 rounded-2xl px-4 py-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
            placeholder="Ask a question or send an update..."
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
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
