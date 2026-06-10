import { createServerClient } from '@/lib/supabase/server'

const SHARE_BASE = 'https://share2.dexcom.com/ShareWebServices/Services'
const APP_ID = 'd89443d2-327c-4a6f-89e5-496bbb0317db'

const TREND_MAP: Record<number, string> = {
  1: 'doubleDown',
  2: 'singleDown',
  3: 'fortyFiveDown',
  4: 'flat',
  5: 'fortyFiveUp',
  6: 'singleUp',
  7: 'doubleUp',
}

function parseDexcomDate(wt: string): string {
  const ms = parseInt(wt.replace(/[^0-9]/g, ''))
  return new Date(ms).toISOString()
}

async function authenticate(): Promise<string> {
  const res = await fetch(`${SHARE_BASE}/General/AuthenticatePublisherAccount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      accountName: process.env.DEXCOM_ACCOUNT_NAME,
      password: process.env.DEXCOM_PASSWORD,
      applicationId: APP_ID,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Dexcom Share auth failed: ${res.status} ${text}`)
  }
  const token = await res.json()
  return token as string
}

export async function ingestViaShare(): Promise<{ inserted: number; skipped: number; info?: string }> {
  if (!process.env.DEXCOM_ACCOUNT_NAME || !process.env.DEXCOM_PASSWORD) {
    return { inserted: 0, skipped: 0, info: 'DEXCOM_ACCOUNT_NAME or DEXCOM_PASSWORD not set' }
  }

  const sessionId = await authenticate()

  const params = new URLSearchParams({ sessionId, minutes: '35', maxCount: '8' })
  const res = await fetch(`${SHARE_BASE}/Publisher/ReadPublisherLatestGlucoseValues?${params}`, {
    headers: { 'Accept': 'application/json' },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Dexcom Share fetch failed: ${res.status} ${text}`)
  }

  const readings: Array<{ WT: string; DT: string; Value: number; Trend: number }> = await res.json()

  if (!readings || readings.length === 0) {
    return { inserted: 0, skipped: 0, info: 'no readings returned' }
  }

  const rows = readings.map(r => ({
    system_time: parseDexcomDate(r.WT),
    display_time: parseDexcomDate(r.DT),
    value_mgdl: r.Value,
    trend: TREND_MAP[r.Trend] ?? 'flat',
    status: null,
    trend_rate: null,
  }))

  const supabase = createServerClient()
  const { error } = await supabase
    .from('dexcom_egvs')
    .upsert(rows, { onConflict: 'system_time', ignoreDuplicates: true })

  if (error) throw new Error(`Failed to upsert EGVs: ${error.message}`)

  return { inserted: rows.length, skipped: 0 }
}
