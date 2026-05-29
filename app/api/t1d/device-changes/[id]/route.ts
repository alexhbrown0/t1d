import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json() as {
    removed_at?: string
    removal_reason?: 'replaced' | 'failed_early'
    failure_notes?: string
    alarm_code?: string
    claim_submitted?: boolean
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('t1d_device_changes')
    .update({
      removed_at: body.removed_at ?? new Date().toISOString(),
      removal_reason: body.removal_reason ?? null,
      failure_notes: body.failure_notes ?? null,
      alarm_code: body.alarm_code ?? null,
      claim_submitted: body.claim_submitted ?? false,
      claim_submitted_at: body.claim_submitted ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
