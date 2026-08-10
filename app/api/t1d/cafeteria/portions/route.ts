import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { claude, classifyClaudeError } from '@/lib/claude/client'
import type { MealItem } from '@/types/health'

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const form = await req.formData()
  const file = form.get('photo') as File | null
  const mealId = form.get('meal_id') as string | null
  if (!file) return NextResponse.json({ error: 'No photo provided' }, { status: 400 })
  if (!mealId) return NextResponse.json({ error: 'meal_id required' }, { status: 400 })

  const supabase = createServerClient()
  const { data: meal } = await supabase
    .from('t1d_meal_events')
    .select('items_offered')
    .eq('id', mealId)
    .single()
  const items = (meal?.items_offered as MealItem[]) ?? []
  if (items.length === 0) return NextResponse.json({ error: 'Meal has no items' }, { status: 400 })

  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg'
  if (file.type === 'image/png') mediaType = 'image/png'
  else if (file.type === 'image/webp') mediaType = 'image/webp'
  const imageBase64 = Buffer.from(await file.arrayBuffer()).toString('base64')

  const itemList = items.map(i => `- ${i.name} (one standard serving = ${i.carbs}g carbs)`).join('\n')

  const prompt = `This is a photo of a child's cafeteria lunch tray, taken BEFORE he eats. The tray should contain these items (the carb value shown is for ONE standard serving):
${itemList}

For each item, estimate the PORTION on the plate relative to one standard serving, as a multiplier:
- 1.0 = a standard serving
- 0.5 = about half a serving
- 1.5 = about one and a half servings
- 0 = the item is not actually on the tray

Only include items from the list above. Return ONLY valid JSON, no markdown:
{ "items": [ { "name": "<exact name from the list>", "portion": 1.0 } ], "notes": "optional" }`

  let response
  try {
    response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    })
  } catch (err) {
    const info = classifyClaudeError(err)
    console.error('[cafeteria/portions] Claude failure:', info.kind, err)
    return NextResponse.json({ error: info.userMessage, ai_unavailable: true }, { status: info.status })
  }

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  try {
    const match = text.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match?.[0] ?? text) as { items?: Array<{ name: string; portion: number }>; notes?: string }
    return NextResponse.json({ items: parsed.items ?? [], notes: parsed.notes ?? null })
  } catch {
    return NextResponse.json({ error: 'Could not read portions from the photo.', raw: text }, { status: 500 })
  }
}
