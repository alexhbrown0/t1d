import { NextRequest, NextResponse } from 'next/server'
import { claude } from '@/lib/claude/client'

interface PhotoItem {
  food_repo_id: string | null
  name: string
  carbs: number
  fat: number | null
  protein: number | null
  qty: number
  serving_size: string
}

export async function POST(req: NextRequest) {
  const { items, message } = await req.json() as { items: PhotoItem[]; message: string }

  const itemsList = items.map(i => `- ${i.name}: ${i.qty} × ${i.carbs}g carbs each`).join('\n')

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Current photo estimates for a child's school lunch:\n${itemsList}\n\nUser correction: "${message}"\n\nApply the correction and return updated items. Keep unchanged items exactly as-is. Return ONLY valid JSON:\n{"items":[{"name":"...","qty":1,"carbs":14,"fat":2,"protein":3,"serving_size":"1 slice","food_repo_id":null}],"reply":"brief confirmation of what you changed"}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  try {
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as {
      items: PhotoItem[]
      reply: string
    }
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Failed to parse response' }, { status: 500 })
  }
}
