import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json() as { kind?: string; summary?: string; detail?: string | null; logged_by?: string | null }
  if (!body.kind || !body.summary) {
    return NextResponse.json({ error: 'kind and summary are required' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('t1d_events')
    .insert({ kind: body.kind, summary: body.summary, detail: body.detail ?? null, logged_by: body.logged_by ?? null })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const params = new URL(req.url).searchParams
  const since = params.get('since')
  const limit = Math.min(parseInt(params.get('limit') ?? '20'), 50)

  // Only unacknowledged events — once any device acknowledges one it drops
  // off every device's next poll.
  let q = supabase.from('t1d_events').select('*').is('acknowledged_at', null).order('created_at', { ascending: false }).limit(limit)
  if (since) q = q.gt('created_at', since)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Acknowledge one event (or all) so it clears across every device.
export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json().catch(() => ({})) as { id?: string; all?: boolean }
  let q = supabase.from('t1d_events').update({ acknowledged_at: new Date().toISOString() }).is('acknowledged_at', null)
  if (body.id) q = q.eq('id', body.id)
  else if (!body.all) return NextResponse.json({ error: 'id or all required' }, { status: 400 })
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
