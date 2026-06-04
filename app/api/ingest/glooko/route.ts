import { NextRequest, NextResponse } from 'next/server'
import { importGlookoZip } from '@/lib/glooko/importer'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const supabase = createServerClient()
  const summary = await importGlookoZip(supabase, buffer)

  // Trigger nightly insights generation after Glooko data lands
  // Fire-and-forget — don't block the response
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`
  fetch(`${baseUrl}/api/claude/t1d-daily-learning?force=false`, {
    method: 'POST',
    headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
  }).catch(() => null)

  return NextResponse.json(summary)
}
