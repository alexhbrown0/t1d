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

  return NextResponse.json(summary)
}
