import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { computeFpu } from '@/lib/t1d/fpu'
import type { MealItem } from '@/types/health'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerClient()
  const { id } = await params
  const body = await req.json() as {
    items_offered?: MealItem[]
    items_eaten?: MealItem[]
    entered_by?: string
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.items_offered) {
    const totalCarbs = body.items_offered.reduce((s, i) => s + i.carbs * i.qty_offered, 0)
    const totalFat = body.items_offered.reduce((s, i) => s + (i.fat ?? 0) * i.qty_offered, 0)
    const totalProtein = body.items_offered.reduce((s, i) => s + (i.protein ?? 0) * i.qty_offered, 0)
    Object.assign(update, {
      items_offered: body.items_offered,
      total_offered_carbs: totalCarbs,
      total_fat_g: totalFat,
      total_protein_g: totalProtein,
      fpu_count: computeFpu(totalFat, totalProtein),
      source: 'manual',
    })
    if (body.entered_by) update.entered_by = body.entered_by
  }

  if (body.items_eaten) {
    const totalEatenCarbs = body.items_eaten.reduce((s, i) => s + i.carbs * (i.qty_eaten ?? 0), 0)
    const totalFat = body.items_eaten.reduce((s, i) => s + (i.fat ?? 0) * (i.qty_eaten ?? 0), 0)
    const totalProtein = body.items_eaten.reduce((s, i) => s + (i.protein ?? 0) * (i.qty_eaten ?? 0), 0)
    Object.assign(update, {
      items_eaten: body.items_eaten,
      total_eaten_carbs: totalEatenCarbs,
      total_fat_g: totalFat,
      total_protein_g: totalProtein,
      fpu_count: computeFpu(totalFat, totalProtein),
    })
    if (body.entered_by) update.entered_by = body.entered_by
  }

  const { data, error } = await supabase
    .from('t1d_meal_events')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
