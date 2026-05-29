import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import JSZip from 'jszip'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const zip = await JSZip.loadAsync(buffer)
  const fileNames = Object.keys(zip.files)

  const supabase = createServerClient()
  const results: Record<string, number | string> = {}

  // Bolus data
  const bolusEntry = fileNames.find(n => n.toLowerCase().includes('bolus_data'))
  if (bolusEntry) {
    const csv = await zip.files[bolusEntry].async('string')
    const rows = parseBolusCsv(csv)
    if (rows.length > 0) {
      const { error } = await supabase
        .from('glooko_bolus')
        .upsert(rows, { onConflict: 'timestamp,insulin_delivered_u,serial_number', ignoreDuplicates: true })
      results.bolus = error ? `error: ${error.message}` : rows.length
    } else {
      results.bolus = 0
    }
  }

  // CGM data — all cgm_data_*.csv files, load into dexcom_egvs
  const cgmEntries = fileNames.filter(n => n.toLowerCase().includes('cgm_data'))
  let cgmTotal = 0
  for (const entry of cgmEntries) {
    const csv = await zip.files[entry].async('string')
    const rows = parseCgmCsv(csv)
    if (rows.length === 0) continue
    // Batch upsert in chunks of 500 to avoid payload limits
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const { error } = await supabase
        .from('dexcom_egvs')
        .upsert(chunk, { onConflict: 'system_time', ignoreDuplicates: true })
      if (error) {
        results.cgm_error = error.message
        break
      }
      cgmTotal += chunk.length
    }
  }
  results.cgm = cgmTotal

  return NextResponse.json(results)
}

function parseBolusCsv(csv: string) {
  const lines = csv.replace(/^﻿/, '').split('\n').map(l => l.trim()).filter(Boolean)
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

// Glooko exports timestamps in local time with no timezone marker.
// Set GLOOKO_TIMEZONE to your IANA timezone (e.g. "America/Chicago").
const GLOOKO_TZ = process.env.GLOOKO_TIMEZONE ?? 'America/Chicago'

function localToUtc(localStr: string, timezone: string): string {
  // localStr: "2026-03-12 05:52" — no seconds, no offset
  const normalized = localStr.trim().replace(' ', 'T') + ':00'
  // Parse as if it were UTC to get a Date we can pass to Intl
  const asUtc = new Date(normalized + 'Z')
  // Ask Intl what that UTC instant looks like in the target timezone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(asUtc)
  const p: Record<string, string> = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  const h = p.hour === '24' ? '00' : p.hour
  // What UTC time produces this local display? That's the offset reference.
  const localAsUtc = new Date(`${p.year}-${p.month}-${p.day}T${h}:${p.minute}:${p.second}Z`)
  const offsetMs = localAsUtc.getTime() - asUtc.getTime()
  // Actual UTC = local time minus the timezone offset
  return new Date(asUtc.getTime() - offsetMs).toISOString()
}

function parseCgmCsv(csv: string) {
  const lines = csv.replace(/^﻿/, '').split('\n').map(l => l.trim()).filter(Boolean)
  // line 0: metadata, line 1: Timestamp,CGM Glucose Value (mg/dl),Serial Number
  const rows = []
  for (let i = 2; i < lines.length; i++) {
    const cols = lines[i].split(',')
    if (cols.length < 2) continue
    const [timestamp, value_raw] = cols
    const value = parseFloat(value_raw)
    if (!timestamp || isNaN(value)) continue
    const t = localToUtc(timestamp, GLOOKO_TZ)
    rows.push({
      system_time: t,
      display_time: t,
      value_mgdl: value,
      status: null,
      trend: null,
      trend_rate: null,
    })
  }
  return rows
}
