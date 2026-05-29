import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import JSZip from 'jszip'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const zip = await JSZip.loadAsync(buffer)

  const bolusEntry = Object.keys(zip.files).find(name =>
    name.toLowerCase().includes('bolus_data')
  )
  if (!bolusEntry) return NextResponse.json({ error: 'bolus_data not found in zip' }, { status: 400 })

  const csv = await zip.files[bolusEntry].async('string')
  const rows = parseBolusCsv(csv)

  const supabase = createServerClient()
  const { error, count } = await supabase
    .from('glooko_bolus')
    .upsert(rows, { onConflict: 'timestamp,insulin_delivered_u,serial_number', ignoreDuplicates: true })
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ inserted: rows.length })
}

function parseBolusCsv(csv: string) {
  const lines = csv.replace(/^﻿/, '').split('\n').map(l => l.trim()).filter(Boolean)
  // line 0: metadata, line 1: headers, line 2+: data
  const rows = []
  for (let i = 2; i < lines.length; i++) {
    const cols = lines[i].split(',')
    if (cols.length < 6) continue
    const [timestamp, insulin_type, bg_raw, carbs_raw, carbs_ratio_raw, delivered_raw, initial_raw, extended_raw, serial_number] = cols

    const bg = parseFloat(bg_raw)
    const carbs = parseFloat(carbs_raw)

    rows.push({
      timestamp: new Date(timestamp).toISOString(),
      insulin_type: insulin_type || null,
      bg_input_mgdl: !isNaN(bg) && bg > 0 ? bg : null,
      carbs_input_g: !isNaN(carbs) && carbs > 0 ? carbs : null,
      carbs_ratio: parseFloat(carbs_ratio_raw) || null,
      insulin_delivered_u: parseFloat(delivered_raw) || null,
      initial_delivery_u: parseFloat(initial_raw) || null,
      extended_delivery_u: parseFloat(extended_raw) || null,
      serial_number: serial_number?.trim() || null,
    })
  }
  return rows
}
