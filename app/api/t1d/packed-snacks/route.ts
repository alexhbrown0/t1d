import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

interface PackedSnackInput {
  food_repo_id?: string | null
  name: string
  carbs_g: number
  fat_g?: number | null
  protein_g?: number | null
  serving_size?: string | null
  qty?: number
}

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('t1d_packed_snacks')
    .select('*')
    .order('position', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json() as { items?: PackedSnackInput[] }
  const items = body.items

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 })
  }
  if (items.length > 10) {
    return NextResponse.json({ error: 'too many snacks (max 10)' }, { status: 400 })
  }

  const packedAt = new Date().toISOString()
  const rows = items.map((it, i) => ({
    food_repo_id: it.food_repo_id ?? null,
    name: it.name,
    carbs_g: it.carbs_g,
    fat_g: it.fat_g ?? null,
    protein_g: it.protein_g ?? null,
    serving_size: it.serving_size ?? '1 serving',
    qty: it.qty ?? 1,
    position: i,
    packed_at: packedAt,
  }))

  // Replace the whole set (single-user; non-transactional delete+insert is acceptable)
  const { error: delErr } = await supabase.from('t1d_packed_snacks').delete().not('id', 'is', null)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  const { data, error } = await supabase.from('t1d_packed_snacks').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE() {
  const supabase = createServerClient()
  const { error } = await supabase.from('t1d_packed_snacks').delete().not('id', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
