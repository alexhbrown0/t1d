import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { claude } from '@/lib/claude/client'

interface FoodItem {
  name: string
  qty: number
  carbs: number
  fat: number | null
  protein: number | null
  gi_category: 'high' | 'medium' | 'low' | null
  matched_repo_id: string | null
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''

  let imageBase64: string | null = null
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg'

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('photo') as File | null
    if (!file) return NextResponse.json({ error: 'No photo provided' }, { status: 400 })
    const buffer = await file.arrayBuffer()
    imageBase64 = Buffer.from(buffer).toString('base64')
    if (file.type === 'image/png') mediaType = 'image/png'
    else if (file.type === 'image/webp') mediaType = 'image/webp'
  } else {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  // Load food repo for matching
  const supabase = createServerClient()
  const { data: repoItems } = await supabase
    .from('t1d_food_repo')
    .select('id, name, aliases, serving_size, carbs_g, fat_g, protein_g, gi_category')
    .eq('active', true)

  const repoSummary = (repoItems ?? [])
    .map(f => `- ${f.name}${f.aliases?.length ? ` (also: ${f.aliases.join(', ')})` : ''}: ${f.carbs_g}g carbs per ${f.serving_size}${f.gi_category ? `, GI: ${f.gi_category}` : ''}`)
    .join('\n')

  const prompt = `You are analyzing a photo of a child's lunch box or meal to estimate carbohydrates for insulin dosing.

Known foods in our database (use these exact carb values when you recognize them):
${repoSummary || '(no foods in database yet — use general nutrition knowledge)'}

Identify every food item in the photo. For each item:
- Name it specifically
- Estimate quantity (e.g. "1 sandwich", "about 15 chips", "1 juice box")
- Estimate carbs in grams
- Estimate fat and protein if visible (null if unclear)
- Assign gi_category: "high" (white potato, white rice, white bread, crackers, juice, candy), "medium" (pasta, banana, oats, whole grain bread), or "low" (protein, fat, non-starchy veg, dairy, nuts)
- Note if it matches a database entry (repo items already have gi_category — use those values)

Return ONLY valid JSON with this structure:
{
  "items": [
    {
      "name": "Turkey sandwich",
      "qty": 1,
      "carbs": 28,
      "fat": 8,
      "protein": 18,
      "gi_category": "medium",
      "repo_name": "Turkey Sandwich"
    }
  ],
  "notes": "optional note about anything uncertain"
}`

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64,
            },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  let parsed: { items: Array<{ name: string; qty: number; carbs: number; fat: number | null; protein: number | null; gi_category?: 'high' | 'medium' | 'low' | null; repo_name?: string }>; notes?: string }
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch?.[0] ?? text)
  } catch {
    return NextResponse.json({ error: 'Failed to parse Claude response', raw: text }, { status: 500 })
  }

  // Match against repo by name
  const repoByName = new Map((repoItems ?? []).map(f => [f.name.toLowerCase(), f]))
  const repoByAlias = new Map<string, typeof repoItems extends Array<infer T> ? T : never>()
  for (const f of repoItems ?? []) {
    for (const alias of f.aliases ?? []) {
      repoByAlias.set(alias.toLowerCase(), f as never)
    }
  }

  const items: FoodItem[] = parsed.items.map(item => {
    const nameLower = item.name.toLowerCase()
    const repoMatch = repoByName.get(nameLower)
      ?? repoByAlias.get(nameLower)
      ?? (item.repo_name ? repoByName.get(item.repo_name.toLowerCase()) : null)
      ?? null

    return {
      name: item.name,
      qty: item.qty,
      carbs: repoMatch ? repoMatch.carbs_g : item.carbs,
      fat: repoMatch ? (repoMatch.fat_g ?? item.fat) : item.fat,
      protein: repoMatch ? (repoMatch.protein_g ?? item.protein) : item.protein,
      gi_category: (repoMatch?.gi_category ?? item.gi_category ?? null) as 'high' | 'medium' | 'low' | null,
      matched_repo_id: repoMatch?.id ?? null,
    }
  })

  const totalCarbs = items.reduce((sum, i) => sum + i.carbs * i.qty, 0)

  // Overall meal GI: highest GI among items that contribute meaningful carbs
  const GI_RANK = { high: 3, medium: 2, low: 1 }
  const mealGi = items
    .filter(i => i.carbs * i.qty >= 5 && i.gi_category)
    .sort((a, b) => (GI_RANK[b.gi_category!] ?? 0) - (GI_RANK[a.gi_category!] ?? 0))[0]?.gi_category ?? null

  return NextResponse.json({
    items,
    total_carbs: Math.round(totalCarbs),
    meal_gi_category: mealGi,
    notes: parsed.notes ?? null,
  })
}
