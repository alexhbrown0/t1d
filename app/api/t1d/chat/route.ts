import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { claude } from '@/lib/claude/client'
import { getLatestEgvs } from '@/lib/dexcom/client'

const SAVE_INTENT = /\b(save|log|add|write|capture|record)\b.{0,30}\b(note|clinical|protocol|rule|guideline)\b/i

export async function GET() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('t1d_chat_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { message, role = 'user' } = await req.json()
  const supabase = createServerClient()

  const [egvs, paramsResult, lowsResult] = await Promise.all([
    getLatestEgvs(5),
    supabase.from('t1d_engine_params').select('*').order('effective_from', { ascending: false }).limit(1),
    supabase.from('t1d_low_treatments').select('*').gte('timestamp', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()).order('timestamp', { ascending: false }).limit(3),
  ])

  const latest = egvs[0]
  const params = paramsResult.data?.[0]
  const recentLows = lowsResult.data ?? []

  const bgContext = latest
    ? `Current BG: ${latest.value_mgdl} mg/dL, trend: ${latest.trend ?? 'unknown'}`
    : 'No recent CGM data.'

  const recentLowContext = recentLows.length
    ? `Recent lows in past 6h: ${recentLows.map(l => `${l.bg_at_treatment} mg/dL at ${new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`).join(', ')}`
    : ''

  const systemPrompt = `You are an AI assistant helping manage Brooks's Type 1 diabetes. Brooks is a child on Omnipod 5 with Fiasp insulin and Dexcom G7 CGM.

Current context:
- ${bgContext}
${recentLowContext ? `- ${recentLowContext}` : ''}
${params ? `- ICR: ${params.current_icr}, ISF: ${params.current_isf}, Target BG: ${params.target_bg}` : ''}
${params?.clinical_notes ? `\nClinical notes:\n${params.clinical_notes}` : ''}

You help caregivers (parents, nurses, grandparents) make dosing decisions. Be concise, clear, and specific. When giving dosing guidance, always say "enter X grams into the pump" — not units. Only recommend doses when asked or when the situation clearly calls for it. For low BG: fast carbs only, no insulin. Always note if something is uncertain or needs Alexandra's input.`

  const today = new Date().toISOString().split('T')[0]

  const { data: userMsg } = await supabase.from('t1d_chat_log').insert({
    session_date: today,
    role: 'user',
    content: message,
  }).select().single()

  const { data: history } = await supabase
    .from('t1d_chat_log')
    .select('role, content')
    .order('created_at', { ascending: false })
    .limit(10)

  const messages = (history ?? []).reverse().map((m: { role: string; content: string }) => ({
    role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: m.content,
  }))

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: systemPrompt,
    messages,
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text : ''

  const { data: assistantMsg } = await supabase.from('t1d_chat_log').insert({
    session_date: today,
    role: 'assistant',
    content: reply,
  }).select().single()

  // Detect intent to save a clinical note — distill recent conversation into note text
  let proposal: string | null = null
  if (SAVE_INTENT.test(message)) {
    const recentConvo = messages.slice(-8).map(m => `${m.role === 'user' ? 'Alexandra' : 'Assistant'}: ${m.content}`).join('\n')
    const distillResult = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Distill the clinical insight or rule from this conversation into a precise, factual protocol note (2-4 sentences). Write it as a standing instruction for how to handle this situation — not as a conversation summary. No preamble, just the note.\n\n${recentConvo}`,
      }],
    })
    proposal = distillResult.content[0].type === 'text' ? distillResult.content[0].text.trim() : null
  }

  return NextResponse.json({ userMsg, assistantMsg, ...(proposal ? { proposal } : {}) })
}
