import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { computeFpu } from '@/lib/t1d/fpu'
import type { MealItem, MealContext } from '@/types/health'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json() as {
    context: MealContext
    items: MealItem[]
    source: 'photo' | 'manual'
    entered_by?: string
    photo_url?: string
    claude_analysis?: unknown
    timestamp?: string
  }

  if (!body.context || !body.items || !body.source) {
    return NextResponse.json({ error: 'context, items, and source are required' }, { status: 400 })
  }

  const totalCarbs = body.items.reduce((s, i) => s + i.carbs * i.qty_offered, 0)
  const totalFat = body.items.reduce((s, i) => s + (i.fat ?? 0) * i.qty_offered, 0)
  const totalProtein = body.items.reduce((s, i) => s + (i.protein ?? 0) * i.qty_offered, 0)
  const fpuCount = computeFpu(totalFat, totalProtein)

  const { data, error } = await supabase
    .from('t1d_meal_events')
    .insert({
      timestamp: body.timestamp ?? new Date().toISOString(),
      context: body.context,
      items_offered: body.items,
      total_offered_carbs: totalCarbs,
      total_fat_g: totalFat,
      total_protein_g: totalProtein,
      fpu_count: fpuCount,
      photo_url: body.photo_url ?? null,
      claude_analysis: body.claude_analysis ?? null,
      source: body.source,
      entered_by: body.entered_by ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
