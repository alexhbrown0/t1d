import { NextRequest, NextResponse } from 'next/server'
import { claude, classifyClaudeError } from '@/lib/claude/client'

export const maxDuration = 120

const MAX_PAGES = 5 // menus are typically ≤5 weekly pages; extra pages return empty

interface MenuDay { date: string; items: Array<{ name: string; carbs_g: number; category?: string | null }> }

function extractJson(text: string): { days?: MenuDay[] } | null {
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  try {
    const match = cleaned.match(/\{[\s\S]*\}/)
    return JSON.parse(match?.[0] ?? cleaned)
  } catch {
    return null
  }
}

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

  const extractPage = async (page: number): Promise<MenuDay[]> => {
    const prompt = `This is a monthly school lunch menu PDF. Each page shows one week (about 5 day-columns), with carbohydrate grams per serving for each food item.

Extract EVERY food item with its carb count from **PAGE ${page} ONLY**. If the PDF has no page ${page}, return {"days": []}.

For each day, use the printed date (e.g. "Tuesday, 11 August") plus the report's year (from the footer, e.g. "August 6, 2026") to build an ISO date. Classify each item's category as "entree", "side", "milk", or "condiment" (best guess; null if unclear).

Return ONLY valid JSON, no markdown:
{ "days": [ { "date": "2026-08-11", "items": [ { "name": "Grilled Chicken Patty Sandwich", "carbs_g": 28.2, "category": "entree" } ] } ] }`

    const resp = await claude.messages.create({
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
    const text = resp.content[0].type === 'text' ? resp.content[0].text : ''
    return extractJson(text)?.days ?? []
  }

  const results = await Promise.allSettled(
    Array.from({ length: MAX_PAGES }, (_, i) => extractPage(i + 1))
  )

  const anyClaudeError = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined
  const succeeded = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<MenuDay[]>[]

  if (succeeded.length === 0 && anyClaudeError) {
    const info = classifyClaudeError(anyClaudeError.reason)
    console.error('[cafeteria-menu/parse] all pages failed:', info.kind, anyClaudeError.reason)
    return NextResponse.json({ error: info.userMessage, ai_unavailable: true }, { status: info.status })
  }

  // Merge pages, dedupe by date (keep the richest extraction per date)
  const byDate = new Map<string, MenuDay>()
  for (const r of succeeded) {
    for (const day of r.value) {
      if (!day?.date || !Array.isArray(day.items) || day.items.length === 0) continue
      const existing = byDate.get(day.date)
      if (!existing || day.items.length > existing.items.length) byDate.set(day.date, day)
    }
  }
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))

  if (days.length === 0) {
    return NextResponse.json({ error: 'Could not read any days from the menu. Try a clearer PDF or add items manually.' }, { status: 500 })
  }
  return NextResponse.json({ days })
}
