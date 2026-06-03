import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { claude } from '@/lib/claude/client'
import type { MealItem } from '@/types/health'

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const form = await req.formData()
  const file = form.get('photo') as File | null
  const mealId = form.get('meal_id') as string | null

  if (!file || !mealId) return NextResponse.json({ error: 'photo and meal_id required' }, { status: 400 })

  const buf = await file.arrayBuffer()
  const imageBase64 = Buffer.from(buf).toString('base64')
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg'
  if (file.type === 'image/png') mediaType = 'image/png'
  else if (file.type === 'image/webp') mediaType = 'image/webp'

  const supabase = createServerClient()
  const { data: meal } = await supabase
    .from('t1d_meal_events')
    .select('items_offered')
    .eq('id', mealId)
    .single()

  const packed: MealItem[] = meal?.items_offered ?? []
  const packedDesc = packed.length
    ? packed.map(i => `- ${i.name}: packed ${i.qty_offered} × ${i.carbs}g carbs each`).join('\n')
    : '(no items known)'

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: imageBase64 },
        },
        {
          type: 'text',
          text: `This photo shows what remains in a child's lunchbox after eating. The packed items were:\n${packedDesc}\n\nFor each packed item, estimate the fraction REMAINING (0=all eaten, 0.5=half left, 1=untouched). If an item isn't visible, assume 0 (eaten).\n\nReturn ONLY valid JSON:\n{"items":[{"name":"...","fraction_remaining":0.3}],"notes":"..."}`,
        },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  let parsed: { items: { name: string; fraction_remaining: number }[]; notes?: string }
  try {
    parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
  } catch {
    return NextResponse.json({ error: 'Failed to parse Claude response' }, { status: 500 })
  }

  const items_eaten: MealItem[] = packed.map(item => {
    const match = parsed.items?.find(p =>
      item.name.toLowerCase().includes(p.name.toLowerCase().slice(0, 6)) ||
      p.name.toLowerCase().includes(item.name.toLowerCase().slice(0, 6))
    )
    const fracRemaining = match?.fraction_remaining ?? 0
    const qtyEaten = Math.round(item.qty_offered * (1 - fracRemaining) * 10) / 10
    return { ...item, qty_eaten: qtyEaten }
  })

  const total_remaining_carbs = Math.round(
    items_eaten.reduce((s, i) => s + i.carbs * (i.qty_offered - (i.qty_eaten ?? 0)), 0)
  )

  return NextResponse.json({ items_eaten, total_remaining_carbs, notes: parsed.notes ?? null })
}
