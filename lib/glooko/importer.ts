import JSZip from 'jszip'
import { SupabaseClient } from '@supabase/supabase-js'
import { parseBolusCsv, parseCgmCsv } from './parser'

export type GlookoImportSummary = {
  bolus: number
  cgm: number
  skipped: string[]
}

type ImportOptions = {
  timezone?: string
}

export async function importGlookoZip(
  supabase: SupabaseClient,
  buffer: Buffer,
  options: ImportOptions = {},
): Promise<GlookoImportSummary> {
  const zip = await JSZip.loadAsync(buffer)
  const fileNames = Object.keys(zip.files)
  const timezone = options.timezone ?? process.env.GLOOKO_TIMEZONE ?? 'America/Chicago'
  const summary: GlookoImportSummary = { bolus: 0, cgm: 0, skipped: [] }

  const bolusEntry = fileNames.find(name => name.toLowerCase().includes('bolus_data'))
  if (bolusEntry) {
    const csv = await zip.files[bolusEntry].async('string')
    const rows = parseBolusCsv(csv, timezone)
    if (rows.length > 0) {
      const { error } = await supabase
        .from('glooko_bolus')
        .upsert(rows, { onConflict: 'timestamp,insulin_delivered_u,serial_number', ignoreDuplicates: true })

      if (error) throw new Error(`Failed to import bolus data: ${error.message}`)
    }
    summary.bolus = rows.length
  } else {
    summary.skipped.push('bolus_data')
  }

  const cgmEntries = fileNames.filter(name => name.toLowerCase().includes('cgm_data'))
  if (cgmEntries.length === 0) summary.skipped.push('cgm_data')

  for (const entry of cgmEntries) {
    const csv = await zip.files[entry].async('string')
    const rows = parseCgmCsv(csv, timezone)

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const { error } = await supabase
        .from('dexcom_egvs')
        .upsert(chunk, { onConflict: 'system_time', ignoreDuplicates: true })

      if (error) throw new Error(`Failed to import CGM data from ${entry}: ${error.message}`)
      summary.cgm += chunk.length
    }
  }

  return summary
}
