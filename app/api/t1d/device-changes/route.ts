import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const CGM_LIFE_H = 10 * 24   // G7: 10 days nominal
const CGM_GRACE_H = 240 + 12 // +12h grace
const POD_LIFE_H = 72
const POD_GRACE_H = 80

export async function GET() {
  const supabase = createServerClient()
  const [cgmResult, podResult] = await Promise.all([
    supabase
      .from('t1d_device_changes')
      .select('*')
      .eq('type', 'cgm')
      .is('removed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('t1d_device_changes')
      .select('*')
      .eq('type', 'pod')
      .is('removed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  return NextResponse.json({
    cgm: cgmResult.data ?? null,
    pod: podResult.data ?? null,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    type: 'cgm' | 'pod'
    inserted_at?: string
    serial_number?: string
    lot_number?: string
    sequence_number?: string
    model?: string
  }
  const { type, serial_number, lot_number, sequence_number, model } = body
  if (type !== 'cgm' && type !== 'pod') {
    return NextResponse.json({ error: 'type must be cgm or pod' }, { status: 400 })
  }

  const insertedAt = body.inserted_at ? new Date(body.inserted_at) : new Date()
  const lifeH = type === 'cgm' ? CGM_LIFE_H : POD_LIFE_H
  const graceH = type === 'cgm' ? CGM_GRACE_H : POD_GRACE_H
  const expiresAt = new Date(insertedAt.getTime() + lifeH * 3600000)
  const graceExpiresAt = new Date(insertedAt.getTime() + graceH * 3600000)

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('t1d_device_changes')
    .insert({
      type,
      changed_at: insertedAt.toISOString(),
      inserted_at: insertedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      grace_expires_at: graceExpiresAt.toISOString(),
      serial_number: serial_number ?? null,
      lot_number: lot_number ?? null,
      sequence_number: sequence_number ?? null,
      model: model ?? (type === 'cgm' ? 'Dexcom G7' : 'Omnipod 5'),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
