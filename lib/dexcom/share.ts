import { createServerClient } from '@/lib/supabase/server'

const SHARE_BASE = 'https://share2.dexcom.com/ShareWebServices/Services'
const APP_ID = 'd89443d2-327c-4a6f-89e5-496bbb0317db'

const TREND_MAP: Record<number, string> = {
  1: 'doubleUp',
  2: 'singleUp',
  3: 'fortyFiveUp',
  4: 'flat',
  5: 'fortyFiveDown',
  6: 'singleDown',
  7: 'doubleDown',
}

function parseDexcomDate(dt: string): string {
  // Format: /Date(1623356400000)/ or /Date(1623356400000-0500)/
  // Only take the first digit group (milliseconds since epoch, always UTC)
  const match = dt.match(/\d+/)
  return new Date(parseInt(match![0])).toISOString()
}

async function authenticate(): Promise<string> {
  // Step 1: accountName → accountId
  const authRes = await fetch(`${SHARE_BASE}/General/AuthenticatePublisherAccount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      accountName: process.env.DEXCOM_ACCOUNT_NAME,
      password: process.env.DEXCOM_PASSWORD,
      applicationId: APP_ID,
    }),
  })
  const authText = await authRes.text()
  if (!authRes.ok) throw new Error(`Dexcom Share auth1 failed: ${authRes.status} ${authText}`)
  const accountId = JSON.parse(authText) as string

  // Step 2: accountId → sessionId
  const loginRes = await fetch(`${SHARE_BASE}/General/LoginPublisherAccountById`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      accountId,
      password: process.env.DEXCOM_PASSWORD,
      applicationId: APP_ID,
    }),
  })
  const loginText = await loginRes.text()
  if (!loginRes.ok) throw new Error(`Dexcom Share auth2 failed: ${loginRes.status} ${loginText}`)
  return JSON.parse(loginText) as string
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
  const body = await res.text()
  if (!res.ok) throw new Error(`Dexcom Share fetch failed: ${res.status} ${body}`)

  const readings: Array<{ WT: string; DT: string; Value: number; Trend: number }> = JSON.parse(body)

  if (!readings || readings.length === 0) {
    return { inserted: 0, skipped: 0, info: 'no readings returned' }
  }

  console.log('[share] raw trends:', readings.map(r => ({ value: r.Value, Trend: r.Trend, type: typeof r.Trend })))

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
    .upsert(rows, { onConflict: 'system_time' })

  if (error) throw new Error(`Failed to upsert EGVs: ${error.message}`)

  return { inserted: rows.length, skipped: 0 }
}
