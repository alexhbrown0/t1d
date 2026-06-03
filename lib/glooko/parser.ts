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

function cleanCsvLines(csv: string) {
  return csv.replace(/^\uFEFF/, '').split('\n').map(line => line.trim()).filter(Boolean)
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
