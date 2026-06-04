export type GlookoBolusRow = {
  timestamp: string
  insulin_type: string | null
  bg_input_mgdl: number | null
  carbs_input_g: number | null
  carbs_ratio: number | null
  insulin_delivered_u: number | null
  initial_delivery_u: number | null
  extended_delivery_u: number | null
  serial_number: string | null
}

export type GlookoCgmRow = {
  system_time: string
  display_time: string
  value_mgdl: number
  status: null
  trend: null
  trend_rate: null
}

export type GlookoBgRow = {
  timestamp: string
  glucose_mgdl: number | null
  manual_reading: boolean | null
  serial_number: string | null
}

export type GlookoAlarmRow = {
  timestamp: string
  alarm_event: string | null
  serial_number: string | null
}

export type GlookoBasalRow = {
  timestamp: string
  insulin_type: string | null
  duration_minutes: number | null
  percentage_pct: number | null
  rate: number | null
  insulin_delivered_u: number | null
  serial_number: string | null
}

export type GlookoCarbsRow = {
  timestamp: string
  carbs_g: number | null
}

export type GlookoFoodRow = {
  timestamp: string
  name: string | null
  carbs_g: number | null
  fat: number | null
  protein: number | null
  calories: number | null
  serving_quantity: number | null
  num_servings: number | null
}

export type GlookoExerciseRow = {
  timestamp: string
  name: string | null
  intensity: string | null
  duration_minutes: number | null
  calories_burned: number | null
}

export type GlookoMedicationRow = {
  timestamp: string
  name: string | null
  value: string | null
  medication_type: string | null
}

export type GlookoNoteRow = {
  timestamp: string
  value: string | null
}

export type GlookoManualInsulinRow = {
  timestamp: string
  name: string | null
  value: number | null
  insulin_type: string | null
}

export type GlookoInsulinTotalsRow = {
  timestamp: string
  total_bolus_u: number | null
  total_insulin_u: number | null
  total_basal_u: number | null
  serial_number: string | null
}

const DEFAULT_TIMEZONE = 'America/Chicago'

export function localToUtc(localStr: string, timezone = DEFAULT_TIMEZONE): string {
  const normalized = normalizeLocalTimestamp(localStr)
  const asUtc = new Date(`${normalized}Z`)

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(asUtc)

  const p: Record<string, string> = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  const hour = p.hour === '24' ? '00' : p.hour
  const localAsUtc = new Date(`${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}Z`)
  const offsetMs = localAsUtc.getTime() - asUtc.getTime()

  return new Date(asUtc.getTime() - offsetMs).toISOString()
}

export function parseBolusCsv(csv: string, timezone = DEFAULT_TIMEZONE): GlookoBolusRow[] {
  const lines = cleanCsvLines(csv)
  const rows: GlookoBolusRow[] = []

  for (let i = 2; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    if (cols.length < 6) continue

    const [
      timestamp,
      insulinType,
      bgRaw,
      carbsRaw,
      carbsRatioRaw,
      deliveredRaw,
      initialRaw,
      extendedRaw,
      serialNumber,
    ] = cols

    if (!timestamp) continue

    rows.push({
      timestamp: localToUtc(timestamp, timezone),
      insulin_type: insulinType || null,
      bg_input_mgdl: positiveNumberOrNull(bgRaw),
      carbs_input_g: positiveNumberOrNull(carbsRaw),
      carbs_ratio: numberOrNull(carbsRatioRaw),
      insulin_delivered_u: numberOrNull(deliveredRaw),
      initial_delivery_u: numberOrNull(initialRaw),
      extended_delivery_u: numberOrNull(extendedRaw),
      serial_number: serialNumber?.trim() || null,
    })
  }

  return rows
}

export function parseCgmCsv(csv: string, timezone = DEFAULT_TIMEZONE): GlookoCgmRow[] {
  const lines = cleanCsvLines(csv)
  const rows: GlookoCgmRow[] = []

  for (let i = 2; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    if (cols.length < 2) continue

    const [timestamp, valueRaw] = cols
    const value = Number.parseFloat(valueRaw)
    if (!timestamp || Number.isNaN(value)) continue

    const t = localToUtc(timestamp, timezone)
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

export function parseBgCsv(csv: string, timezone = DEFAULT_TIMEZONE): GlookoBgRow[] {
  return parseDataRows(csv).map(cols => ({
    timestamp: localToUtc(cols[0], timezone),
    glucose_mgdl: numberOrNull(cols[1]),
    manual_reading: booleanMarkerOrNull(cols[2]),
    serial_number: cols[3]?.trim() || null,
  })).filter(row => row.timestamp && row.glucose_mgdl !== null)
}

export function parseAlarmsCsv(csv: string, timezone = DEFAULT_TIMEZONE): GlookoAlarmRow[] {
  return parseDataRows(csv).map(cols => ({
    timestamp: localToUtc(cols[0], timezone),
    alarm_event: cols[1] || null,
    serial_number: cols[2]?.trim() || null,
  })).filter(row => row.timestamp && row.alarm_event)
}

export function parseBasalCsv(csv: string, timezone = DEFAULT_TIMEZONE): GlookoBasalRow[] {
  return parseDataRows(csv).map(cols => ({
    timestamp: localToUtc(cols[0], timezone),
    insulin_type: cols[1] || null,
    duration_minutes: numberOrNull(cols[2]),
    percentage_pct: numberOrNull(cols[3]),
    rate: numberOrNull(cols[4]),
    insulin_delivered_u: numberOrNull(cols[5]),
    serial_number: cols[6]?.trim() || null,
  })).filter(row => row.timestamp)
}

export function parseCarbsCsv(csv: string, timezone = DEFAULT_TIMEZONE): GlookoCarbsRow[] {
  return parseDataRows(csv).map(cols => ({
    timestamp: localToUtc(cols[0], timezone),
    carbs_g: numberOrNull(cols[1]),
  })).filter(row => row.timestamp && row.carbs_g !== null)
}

export function parseFoodCsv(csv: string, timezone = DEFAULT_TIMEZONE): GlookoFoodRow[] {
  return parseDataRows(csv).map(cols => ({
    timestamp: localToUtc(cols[0], timezone),
    name: cols[1] || null,
    carbs_g: numberOrNull(cols[2]),
    fat: numberOrNull(cols[3]),
    protein: numberOrNull(cols[4]),
    calories: numberOrNull(cols[5]),
    serving_quantity: numberOrNull(cols[6]),
    num_servings: numberOrNull(cols[7]),
  })).filter(row => row.timestamp && row.name)
}

export function parseExerciseCsv(csv: string, timezone = DEFAULT_TIMEZONE): GlookoExerciseRow[] {
  return parseDataRows(csv).map(cols => ({
    timestamp: localToUtc(cols[0], timezone),
    name: cols[1] || null,
    intensity: cols[2] || null,
    duration_minutes: numberOrNull(cols[3]),
    calories_burned: numberOrNull(cols[4]),
  })).filter(row => row.timestamp && row.name)
}

export function parseMedicationCsv(csv: string, timezone = DEFAULT_TIMEZONE): GlookoMedicationRow[] {
  return parseDataRows(csv).map(cols => ({
    timestamp: localToUtc(cols[0], timezone),
    name: cols[1] || null,
    value: cols[2] || null,
    medication_type: cols[3] || null,
  })).filter(row => row.timestamp && row.name)
}

export function parseNotesCsv(csv: string, timezone = DEFAULT_TIMEZONE): GlookoNoteRow[] {
  return parseDataRows(csv).map(cols => ({
    timestamp: localToUtc(cols[0], timezone),
    value: cols[1] || null,
  })).filter(row => row.timestamp && row.value)
}

export function parseManualInsulinCsv(csv: string, timezone = DEFAULT_TIMEZONE): GlookoManualInsulinRow[] {
  return parseDataRows(csv).map(cols => ({
    timestamp: localToUtc(cols[0], timezone),
    name: cols[1] || null,
    value: numberOrNull(cols[2]),
    insulin_type: cols[3] || null,
  })).filter(row => row.timestamp && row.name)
}

export function parseInsulinTotalsCsv(csv: string, timezone = DEFAULT_TIMEZONE): GlookoInsulinTotalsRow[] {
  return parseDataRows(csv).map(cols => ({
    timestamp: localToUtc(cols[0], timezone),
    total_bolus_u: numberOrNull(cols[1]),
    total_insulin_u: numberOrNull(cols[2]),
    total_basal_u: numberOrNull(cols[3]),
    serial_number: cols[4]?.trim() || null,
  })).filter(row => row.timestamp)
}

function cleanCsvLines(csv: string) {
  return csv.replace(/^\uFEFF/, '').split('\n').map(line => line.trim()).filter(Boolean)
}

function parseDataRows(csv: string) {
  return cleanCsvLines(csv).slice(2).map(parseCsvLine).filter(cols => cols[0])
}

function normalizeLocalTimestamp(value: string) {
  const trimmed = value.trim()
  const withDateSeparator = trimmed.replace(' ', 'T')
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(withDateSeparator)
    ? `${withDateSeparator}:00`
    : withDateSeparator

  return withSeconds
}

function parseCsvLine(line: string) {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"' && next === '"') {
      current += '"'
      i++
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  cells.push(current.trim())
  return cells
}

function positiveNumberOrNull(value: string | undefined) {
  const parsed = numberOrNull(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

function numberOrNull(value: string | undefined) {
  if (!value) return null
  const parsed = Number.parseFloat(value)
  return Number.isNaN(parsed) ? null : parsed
}

function booleanMarkerOrNull(value: string | undefined) {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (['m', 'manual', 'true', 'yes', 'y', '1'].includes(normalized)) return true
  if (['false', 'no', 'n', '0'].includes(normalized)) return false
  return null
}
