import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import type { T1dFoodRepo } from '@/types/health'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('t1d_food_repo')
    .select('*')
    .eq('active', true)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json() as Partial<T1dFoodRepo>

  if (!body.name || body.carbs_g == null || !body.serving_size) {
    return NextResponse.json({ error: 'name, carbs_g, and serving_size are required' }, { status: 400 })
  }

  // Derive gi_category from gi_estimate if provided
  const gi = body.gi_estimate
  const gi_category = gi == null ? null : gi <= 55 ? 'low' : gi <= 69 ? 'medium' : 'high'

  const { data, error } = await supabase
    .from('t1d_food_repo')
    .insert({ ...body, gi_category })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json() as Partial<T1dFoodRepo> & { id: string }

  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const gi = body.gi_estimate
  const gi_category = gi == null ? undefined : gi <= 55 ? 'low' : gi <= 69 ? 'medium' : 'high'

  const { id, ...fields } = body
  const { data, error } = await supabase
    .from('t1d_food_repo')
    .update({ ...fields, ...(gi_category ? { gi_category } : {}), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
