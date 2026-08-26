import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { claude, classifyClaudeError } from '@/lib/claude/client'

interface FoodItem {
  name: string
  qty: number
  carbs: number
  fat: number | null
  protein: number | null
  gi_category: 'high' | 'medium' | 'low' | null
  matched_repo_id: string | null
  serving_size: string
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''

  let imageBase64: string | null = null
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg'
  let hint = ''
  let menuItems: Array<{ name: string; carbs: number }> = []

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('photo') as File | null
    if (!file) return NextResponse.json({ error: 'No photo provided' }, { status: 400 })
    const buffer = await file.arrayBuffer()
    imageBase64 = Buffer.from(buffer).toString('base64')
    if (file.type === 'image/png') mediaType = 'image/png'
    else if (file.type === 'image/webp') mediaType = 'image/webp'
    hint = ((form.get('hint') as string | null) ?? '').trim()
    const menuRaw = form.get('menu') as string | null
    if (menuRaw) { try { menuItems = JSON.parse(menuRaw) } catch { /* ignore */ } }
  } else {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const menuSummary = menuItems.length > 0
    ? menuItems.map(m => `- ${m.name}: ${m.carbs}g`).join('\n')
    : ''

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
${hint ? `\nThe caregiver added this note about the food — treat it as GROUND TRUTH. If it states a count or portion (e.g. "6 grapes", "2 strawberries"), use those exact numbers as qty and do not re-estimate them: "${hint}"\n` : ''}${menuSummary ? `\nThis is a SCHOOL CAFETERIA tray. Today's cafeteria menu options with their published carb counts are below — when a tray item clearly matches one of these, use that item's name and its published per-serving carb value (scaled by the portion you see). Also identify anything on the tray NOT on this list (e.g. chips, brownie, carrots, fruit) using general nutrition knowledge:\n${menuSummary}\n` : ''}
Known foods in our database (use these exact carb values when you recognize them):
${repoSummary || '(no foods in database yet — use general nutrition knowledge)'}

Identify every food item in the photo. For EACH item return three linked fields — carbs, serving_size, and qty — where the total carbs = carbs × qty:
- name: name it specifically
- serving_size: the single unit that "carbs" describes
- carbs: carbs in grams for ONE serving_size unit (NOT the whole portion)
- qty: how many of that unit are present

CRITICAL — pick the unit by how the food is naturally counted:
- Countable small pieces (M&M's and other candies, gummies, individual crackers/chips/pretzels, nuts, berries, grapes): use serving_size "1 piece" (or "1 cracker"/"1 pretzel"/etc.), set carbs to the per-PIECE carbs, and set qty to the number of pieces you see. Example: ~20 peanut M&M's → { carbs: 1.4, qty: 20, serving_size: "1 piece" } = 28g, NOT { carbs: 28, qty: 1 }.

COUNTING — this matters most. Before writing any JSON, actually count each countable item out loud, one piece at a time, in the "counting" field below (e.g. "grapes: 1,2,3,4,5,6 → 6; strawberries: 1,2 → 2"). Enumerate every distinct piece exactly once. Do not double-count overlaps and do not round up to a nicer number. Only after you have tallied should you fill in qty from your own tally. If pieces overlap or are partly hidden, count what you can distinguish and pick the lower number when genuinely unsure.
- Pre-portioned packages (juice box, yogurt pouch, granola bar, chip bag, sandwich, Lunchable): serving_size is that package ("1 box", "1 bar", "1 sandwich"), carbs is one package, qty is the number of packages.
- Bulk/measured foods (rice, pasta, hummus, sauce): serving_size is a sensible measure ("1 cup", "2 tbsp"), carbs is one measure, qty is how many measures.
- When an item matches a known food above, express carbs and serving_size in THAT food's unit and set qty to the count in that unit.

Also for each item:
- Estimate fat and protein per serving_size if visible (null if unclear)
- Assign gi_category: "high" (white potato, white rice, white bread, crackers, juice, candy), "medium" (pasta, banana, oats, whole grain bread), or "low" (protein, fat, non-starchy veg, dairy, nuts)
- Note if it matches a database entry (repo items already have gi_category — use those values)

First write your piece-by-piece tally as plain text. THEN, as the last thing in your reply, output the final JSON inside a \`\`\`json code block with this structure (qty must equal your tally):
\`\`\`json
{
  "items": [
    {
      "name": "Peanut M&M's",
      "serving_size": "1 piece",
      "qty": 20,
      "carbs": 1.4,
      "fat": 0.7,
      "protein": 0.5,
      "gi_category": "high",
      "counting": "1,2,3...20 → 20",
      "repo_name": "M&M's Peanut Chocolate Candies"
    }
  ],
  "notes": "optional note about anything uncertain"
}
\`\`\``

  let response
  try {
    response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
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
  } catch (err) {
    const info = classifyClaudeError(err)
    console.error('[carb-estimate] Claude failure:', info.kind, err)
    return NextResponse.json({ error: info.userMessage, ai_unavailable: true }, { status: info.status })
  }

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  let parsed: { items: Array<{ name: string; qty: number; carbs: number; fat: number | null; protein: number | null; gi_category?: 'high' | 'medium' | 'low' | null; repo_name?: string; serving_size?: string }>; notes?: string }
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonStr = fenced?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text
    parsed = JSON.parse(jsonStr)
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
      serving_size: repoMatch ? repoMatch.serving_size : (item.serving_size || '1 serving'),
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
