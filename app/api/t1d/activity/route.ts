import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = createServerClient()

  const timestamp = new Date()
  if (body.when === 'Just finished') {
    timestamp.setMinutes(timestamp.getMinutes() - (body.duration_minutes ?? 30))
  } else if (body.when === 'In < 30 min') {
    timestamp.setMinutes(timestamp.getMinutes() + 25)
  }

  const insert = supabase.from('t1d_chat_log').insert({
    role: 'user',
    content: `Activity logged: ${body.activity_type} · ${body.duration_minutes}min · ${body.intensity} · ${body.when}`,
    metadata: { activity_type: body.activity_type, duration: body.duration_minutes, intensity: body.intensity, when: body.when },
  })
  await insert

  return NextResponse.json({ ok: true })
}
