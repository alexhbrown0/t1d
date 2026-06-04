import JSZip from 'jszip'
import { SupabaseClient } from '@supabase/supabase-js'
import {
  parseAlarmsCsv,
  parseBasalCsv,
  parseBgCsv,
  parseBolusCsv,
  parseCarbsCsv,
  parseCgmCsv,
  parseExerciseCsv,
  parseFoodCsv,
  parseInsulinTotalsCsv,
  parseManualInsulinCsv,
  parseMedicationCsv,
  parseNotesCsv,
} from './parser'

export type GlookoImportSummary = {
  bolus: number
  cgm: number
  bg: number
  alarms: number
  basal: number
  carbs: number
  food: number
  exercise: number
  medication: number
  notes: number
  manual_insulin: number
  insulin_totals: number
  skipped: string[]
}

type ImportOptions = {
  timezone?: string
}

type Parser<T> = (csv: string, timezone: string) => T[]

export async function importGlookoZip(
  supabase: SupabaseClient,
  buffer: Buffer,
  options: ImportOptions = {},
): Promise<GlookoImportSummary> {
  const zip = await JSZip.loadAsync(buffer)
  const fileNames = Object.keys(zip.files)
  const timezone = options.timezone ?? process.env.GLOOKO_TIMEZONE ?? 'America/Chicago'
  const summary: GlookoImportSummary = {
    bolus: 0,
    cgm: 0,
    bg: 0,
    alarms: 0,
    basal: 0,
    carbs: 0,
    food: 0,
    exercise: 0,
    medication: 0,
    notes: 0,
    manual_insulin: 0,
    insulin_totals: 0,
    skipped: [],
  }

  await importSingle(zip, fileNames, summary, {
    key: 'bolus',
    fileIncludes: 'bolus_data',
    table: 'glooko_bolus',
    onConflict: 'timestamp,insulin_delivered_u,serial_number',
    parse: parseBolusCsv,
    timezone,
    supabase,
  })

  await importMultipleCgm(zip, fileNames, summary, timezone, supabase)

  await importSingle(zip, fileNames, summary, {
    key: 'bg',
    fileIncludes: 'bg_data',
    table: 'glooko_bg',
    onConflict: 'timestamp,glucose_mgdl,serial_number',
    parse: parseBgCsv,
    timezone,
    supabase,
  })

  await importSingle(zip, fileNames, summary, {
    key: 'alarms',
    fileIncludes: 'alarms_data',
    table: 'glooko_alarms',
    onConflict: 'timestamp,alarm_event,serial_number',
    parse: parseAlarmsCsv,
    timezone,
    supabase,
  })

  await importSingle(zip, fileNames, summary, {
    key: 'basal',
    fileIncludes: 'basal_data',
    table: 'glooko_basal',
    onConflict: 'timestamp,insulin_type,duration_minutes,rate,insulin_delivered_u,serial_number',
    parse: parseBasalCsv,
    timezone,
    supabase,
  })

  await importSingle(zip, fileNames, summary, {
    key: 'carbs',
    fileIncludes: 'carbs_data',
    table: 'glooko_carbs',
    onConflict: 'timestamp,carbs_g',
    parse: parseCarbsCsv,
    timezone,
    supabase,
  })

  await importSingle(zip, fileNames, summary, {
    key: 'food',
    fileIncludes: 'food_data',
    table: 'glooko_food',
    onConflict: 'timestamp,name,carbs_g,serving_quantity',
    parse: parseFoodCsv,
    timezone,
    supabase,
  })

  await importSingle(zip, fileNames, summary, {
    key: 'exercise',
    fileIncludes: 'exercise_data',
    table: 'glooko_exercise',
    onConflict: 'timestamp,name,intensity,duration_minutes',
    parse: parseExerciseCsv,
    timezone,
    supabase,
  })

  await importSingle(zip, fileNames, summary, {
    key: 'medication',
    fileIncludes: 'medication_data',
    table: 'glooko_medication',
    onConflict: 'timestamp,name,value,medication_type',
    parse: parseMedicationCsv,
    timezone,
    supabase,
  })

  await importSingle(zip, fileNames, summary, {
    key: 'notes',
    fileIncludes: 'notes_data',
    table: 'glooko_notes',
    onConflict: 'timestamp,value',
    parse: parseNotesCsv,
    timezone,
    supabase,
  })

  await importSingle(zip, fileNames, summary, {
    key: 'manual_insulin',
    fileIncludes: 'manual_insulin_data',
    table: 'glooko_manual_insulin',
    onConflict: 'timestamp,name,value,insulin_type',
    parse: parseManualInsulinCsv,
    timezone,
    supabase,
  })

  await importSingle(zip, fileNames, summary, {
    key: 'insulin_totals',
    fileIncludes: 'insulin_data',
    table: 'glooko_insulin_totals',
    onConflict: 'timestamp,total_bolus_u,total_insulin_u,total_basal_u,serial_number',
    parse: parseInsulinTotalsCsv,
    timezone,
    supabase,
  })

  return summary
}

async function importMultipleCgm(
  zip: JSZip,
  fileNames: string[],
  summary: GlookoImportSummary,
  timezone: string,
  supabase: SupabaseClient,
) {
  const cgmEntries = fileNames.filter(name => name.toLowerCase().includes('cgm_data'))
  if (cgmEntries.length === 0) summary.skipped.push('cgm_data')

  for (const entry of cgmEntries) {
    const csv = await zip.files[entry].async('string')
    const rows = parseCgmCsv(csv, timezone)
    await upsertRows(supabase, 'dexcom_egvs', rows, 'system_time', entry)
    summary.cgm += rows.length
  }
}

async function importSingle<T>(
  zip: JSZip,
  fileNames: string[],
  summary: GlookoImportSummary,
  options: {
    key: Exclude<keyof GlookoImportSummary, 'skipped'>
    fileIncludes: string
    table: string
    onConflict: string
    parse: Parser<T>
    timezone: string
    supabase: SupabaseClient
  },
) {
  const entry = fileNames.find(name => name.toLowerCase().includes(options.fileIncludes))
  if (!entry) {
    summary.skipped.push(options.fileIncludes)
    return
  }

  const csv = await zip.files[entry].async('string')
  const rows = options.parse(csv, options.timezone)
  await upsertRows(options.supabase, options.table, rows, options.onConflict, entry)
  summary[options.key] = rows.length
}

async function upsertRows<T>(
  supabase: SupabaseClient,
  table: string,
  rows: T[],
  onConflict: string,
  sourceName: string,
) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    if (chunk.length === 0) continue

    const { error } = await supabase
      .from(table)
      .upsert(chunk as never[], { onConflict, ignoreDuplicates: true })

    if (error) throw new Error(`Failed to import ${sourceName} into ${table}: ${error.message}`)
  }
}
