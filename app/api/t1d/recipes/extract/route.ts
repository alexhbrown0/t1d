import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const SYSTEM = `You extract recipe nutrition data for a child with Type 1 Diabetes. Return ONLY valid JSON, no markdown, no explanation.`

const PROMPT = `Extract the recipe nutrition info and return JSON exactly matching this schema:

{
  "name": string,
  "yield_count": number | null,
  "yield_unit": string | null,
  "carbs_per_piece": number | null,
  "fat_per_piece": number | null,
  "protein_per_piece": number | null,
  "carbs_per_100g": number | null,
  "fat_per_100g": number | null,
  "protein_per_100g": number | null,
  "typical_serving_g": number | null,
  "typical_serving_description": string | null,
  "gi_category": "low" | "medium" | "high" | null,
  "notes": string | null
}

Rules:
- Use piece fields (carbs_per_piece etc.) for discrete units: cookies, muffins, bars, energy balls, waffles, pancakes
- Use weight fields (carbs_per_100g etc.) for portioned items: cakes, casseroles, breads, soups, quiches
- If the recipe shows "nutrition per serving" for a piece-type item, use that as carbs_per_piece
- yield_unit should be plural lowercase (e.g. "muffins", "cookies", "waffles")
- gi_category: "high" for sugar/white flour heavy; "medium" for oats/whole wheat/banana; "low" for mostly protein/fat/veg
- notes: only include if T1D-relevant (e.g. "high fat from almond butter may delay spike"). null otherwise.
- All numeric values should be rounded to 1 decimal place`

function parseJson(raw: string) {
  return JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim())
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('photo') as File | null
      if (!file) return NextResponse.json({ error: 'no file' }, { status: 400 })

      const bytes = await file.arrayBuffer()
      const base64 = Buffer.from(bytes).toString('base64')
      const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: PROMPT },
          ],
        }],
      })

      const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
      return NextResponse.json(parseJson(text))

    } else {
      const { url } = await req.json()
      if (!url) return NextResponse.json({ error: 'no url' }, { status: 400 })

      const pageRes = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(10000),
      })
      const html = await pageRes.text()
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 20000)

      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: `${PROMPT}\n\nRecipe page content:\n${text}`,
        }],
      })

      const responseText = msg.content[0].type === 'text' ? msg.content[0].text : ''
      return NextResponse.json(parseJson(responseText))
    }
  } catch (e) {
    console.error('recipe extract error', e)
    return NextResponse.json({ error: 'Failed to extract recipe' }, { status: 500 })
  }
}
