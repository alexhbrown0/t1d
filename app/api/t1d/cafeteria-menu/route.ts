import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

interface MenuDay {
  date: string
  items: Array<{ name: string; carbs_g: number; category?: string | null }>
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const params = new URL(req.url).searchParams
  const date = params.get('date')
  const month = params.get('month') // YYYY-MM

  let q = supabase.from('t1d_cafeteria_menu').select('*')
  if (date) {
    q = q.eq('menu_date', date)
  } else if (month) {
    q = q.gte('menu_date', `${month}-01`).lte('menu_date', `${month}-31`)
  }
  const { data, error } = await q.order('menu_date').order('carbs_g', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json() as { days?: MenuDay[] }
  const days = body.days
  if (!Array.isArray(days) || days.length === 0) {
    return NextResponse.json({ error: 'days must be a non-empty array' }, { status: 400 })
  }

  const dates = days.map(d => d.date)
  // Replace existing rows for these dates
  const { error: delErr } = await supabase.from('t1d_cafeteria_menu').delete().in('menu_date', dates)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  const rows = days.flatMap(d =>
    (d.items ?? [])
      .filter(it => it.name && it.carbs_g != null)
      .map(it => ({ menu_date: d.date, name: it.name, carbs_g: it.carbs_g, category: it.category ?? null }))
  )
  if (rows.length === 0) return NextResponse.json({ inserted: 0 })

  const { error } = await supabase.from('t1d_cafeteria_menu').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inserted: rows.length, dates })
}
