import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { computeFpu } from '@/lib/t1d/fpu'
import type { MealItem } from '@/types/health'

// PATCH /api/t1d/meal/[id] — nurse updates qty eaten after lunch
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerClient()
  const { id } = await params
  const body = await req.json() as { items_eaten: MealItem[]; entered_by?: string }

  if (!body.items_eaten) {
    return NextResponse.json({ error: 'items_eaten is required' }, { status: 400 })
  }

  const totalEatenCarbs = body.items_eaten.reduce((s, i) => s + i.carbs * (i.qty_eaten ?? 0), 0)
  const totalFat = body.items_eaten.reduce((s, i) => s + (i.fat ?? 0) * (i.qty_eaten ?? 0), 0)
  const totalProtein = body.items_eaten.reduce((s, i) => s + (i.protein ?? 0) * (i.qty_eaten ?? 0), 0)
  const fpuCount = computeFpu(totalFat, totalProtein)

  const { data, error } = await supabase
    .from('t1d_meal_events')
    .update({
      items_eaten: body.items_eaten,
      total_eaten_carbs: totalEatenCarbs,
      total_fat_g: totalFat,
      total_protein_g: totalProtein,
      fpu_count: fpuCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
