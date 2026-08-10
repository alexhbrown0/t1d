import { NextRequest, NextResponse } from 'next/server'
import { claude, classifyClaudeError } from '@/lib/claude/client'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Please upload a PDF menu' }, { status: 400 })
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')

  const prompt = `This is a monthly school lunch menu with carbohydrate grams per serving for each item on each day.

Extract EVERY day and EVERY food item with its carb count. Use the date shown for each day column (e.g. "Tuesday, 11 August") plus the report's year (find it in the footer, e.g. "August 6, 2026") to produce a full ISO date.

For each item, classify category as one of: "entree", "side", "milk", "condiment" (best guess; use null if unclear). Keep the item name close to what's printed.

Return ONLY valid JSON, no markdown:
{
  "days": [
    { "date": "2026-08-11", "items": [ { "name": "Grilled Chicken Patty Sandwich", "carbs_g": 28.2, "category": "entree" } ] }
  ]
}`

  let response
  try {
    response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    })
  } catch (err) {
    const info = classifyClaudeError(err)
    console.error('[cafeteria-menu/parse] Claude failure:', info.kind, err)
    return NextResponse.json({ error: info.userMessage, ai_unavailable: true }, { status: info.status })
  }

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  try {
    const match = json.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match?.[0] ?? json)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Could not parse the menu. Try again or add items manually.', raw: text }, { status: 500 })
  }
}
