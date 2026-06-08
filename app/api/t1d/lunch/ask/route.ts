import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const { message, meal_event_id, photos } = await req.json() as {
    message: string
    meal_event_id: string
    photos?: { base64: string; mime_type: string }[]
  }

  const supabase = createServerClient()

  const [mealRes, sessionsRes, egvRes] = await Promise.all([
    supabase
      .from('t1d_meal_events')
      .select('items_offered, items_eaten, total_offered_carbs, total_eaten_carbs, context')
      .eq('id', meal_event_id)
      .single(),
    supabase
      .from('t1d_dose_sessions')
      .select('recommended_dose_grams, actual_dose_grams, pump_suggested_units, actual_dose_timestamp, context_snapshot')
      .eq('meal_event_id', meal_event_id)
      .order('created_at', { ascending: true }),
    supabase
      .from('dexcom_egvs')
      .select('value_mgdl, trend, system_time')
      .order('system_time', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const meal = mealRes.data
  const sessions = sessionsRes.data ?? []
  const egv = egvRes.data
  const bgAge = egv ? Date.now() - new Date(egv.system_time).getTime() : Infinity
  const bg = egv && bgAge <= 15 * 60 * 1000 ? egv : null

  const mealDesc = (meal?.items_offered as { name: string; carbs: number; qty_offered: number }[] ?? [])
    .map(i => `${i.name}: ${Math.round(i.carbs * i.qty_offered)}g carbs`)
    .join(', ') || 'unknown'

  const preSession = sessions[0]
  const followUp = sessions.length > 1 ? sessions[sessions.length - 1] : null

  const doseLines: string[] = []
  if (preSession) {
    const given = preSession.actual_dose_grams ?? null
    const rec = preSession.recommended_dose_grams ?? null
    doseLines.push(`Pre-bolus: ${given ?? rec}g${preSession.pump_suggested_units ? ` (${preSession.pump_suggested_units}u)` : ''}${given ? ' — confirmed' : ' — not yet given'}`)
  }
  if (followUp) {
    const given = followUp.actual_dose_grams ?? null
    const rec = followUp.recommended_dose_grams ?? null
    doseLines.push(`Follow-up: ${given ?? rec}g${followUp.pump_suggested_units ? ` (${followUp.pump_suggested_units}u)` : ''}${given ? ' — confirmed' : ' — not yet given'}`)
  }

  const contextBlock = [
    `Meal packed: ${mealDesc}`,
    ...doseLines,
    bg ? `Current BG: ${Math.round(Number(bg.value_mgdl))} mg/dL, ${bg.trend ?? 'steady'}` : 'No current BG reading available',
  ].join('\n')

  const systemPrompt = `You are a T1D decision-support assistant helping manage Brooks's school lunch. Brooks is a child on Omnipod 5 with Fiasp insulin and a Dexcom G7. Keep responses to 3–6 sentences, plain text only. Be direct and clinical.

If the caregiver wants to dose less, or asks what a safer/lower dose would be, give your reasoning AND end with a line in this exact format (nothing else on that line):
SUGGESTED_DOSE: <number>g
Only include this line when recommending a specific adjusted dose — not for general questions.

Current lunch context:\n${contextBlock}`

  const userContent: Anthropic.MessageParam['content'] = []
  for (const p of photos ?? []) {
    userContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: (p.mime_type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
        data: p.base64,
      },
    })
  }
  userContent.push({ type: 'text', text: message || 'What do you see? Is there anything clinically relevant here?' })

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })

  const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const doseMatch = raw.match(/SUGGESTED_DOSE:\s*(\d+(?:\.\d+)?)g/i)
  const suggested_dose_grams = doseMatch ? parseFloat(doseMatch[1]) : null
  const reply = raw.replace(/\nSUGGESTED_DOSE:[^\n]*/i, '').trim()
  return NextResponse.json({ reply, ...(suggested_dose_grams != null ? { suggested_dose_grams } : {}) })
}
