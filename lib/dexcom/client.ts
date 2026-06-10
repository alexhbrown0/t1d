import { getValidAccessToken } from './auth'
import { createServerClient } from '@/lib/supabase/server'
import type { DexcomEgv } from '@/types/health'

const BASE = process.env.DEXCOM_SANDBOX === 'true'
  ? 'https://sandbox-api.dexcom.com'
  : 'https://api.dexcom.com'

async function dexcomFetch(path: string) {
  const token = await getValidAccessToken()
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Dexcom API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function fetchEgvs(startTime: string, endTime: string) {
  const params = new URLSearchParams({ startDate: startTime, endDate: endTime })
  return dexcomFetch(`/v3/users/self/egvs?${params}`)
}

export async function fetchEvents(startTime: string, endTime: string) {
  const params = new URLSearchParams({ startDate: startTime, endDate: endTime })
  return dexcomFetch(`/v3/users/self/events?${params}`)
}

export async function fetchDataRange() {
  return dexcomFetch('/v3/users/self/dataRange')
}

export async function ingestRecentEgvs(): Promise<{ inserted: number; skipped: number; info?: string }> {
  const supabase = createServerClient()

  const { data: lastRow } = await supabase
    .from('dexcom_auth')
    .select('last_synced_at')
    .eq('id', 1)
    .single()

  const endTime = new Date()
  const startTime = lastRow?.last_synced_at
    ? new Date(lastRow.last_synced_at)
    : new Date(endTime.getTime() - 3 * 60 * 60 * 1000)

  const startIso = startTime.toISOString().replace(/\.\d{3}Z$/, '')
  const endIso = endTime.toISOString().replace(/\.\d{3}Z$/, '')

  const data = await fetchEgvs(startIso, endIso)
  const egvs: Array<Record<string, unknown>> = data.egvs ?? data.records ?? []

  console.log('[dexcom-fields]', egvs[0] ? Object.keys(egvs[0]).join(',') : 'empty')
  console.log('[dexcom-first]', JSON.stringify(egvs[0] ?? null))

  if (egvs.length === 0) {
    // Don't advance last_synced_at — Dexcom may just not have data ready yet
    return { inserted: 0, skipped: 0, info: `empty: keys=${Object.keys(data).join(',')} start=${startIso} end=${endIso}` }
  }


  const rows = egvs.map((e) => ({
    system_time: e.systemTime,
    display_time: e.displayTime,
    value_mgdl: e.value ?? null,
    status: e.status ?? null,
    trend: e.trend ?? null,
    trend_rate: e.trendRate ?? null,
  }))

  const { error } = await supabase
    .from('dexcom_egvs')
    .upsert(rows, { onConflict: 'system_time', ignoreDuplicates: true })

  if (error) throw new Error(`Failed to upsert EGVs: ${error.message}`)

  // Advance cursor only to the last reading's timestamp, not the query end.
  // This prevents skipping data when Dexcom's API lags behind wall time.
  const lastReadingTime = rows
    .map(r => r.system_time as string)
    .filter(Boolean)
    .sort()
    .at(-1) ?? endIso

  await supabase
    .from('dexcom_auth')
    .update({ last_synced_at: lastReadingTime })
    .eq('id', 1)

  return { inserted: rows.length, skipped: 0 }
}

export async function getLatestEgvs(n = 5): Promise<DexcomEgv[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('dexcom_egvs')
    .select('*')
    .order('system_time', { ascending: false })
    .limit(n)

  if (error) throw new Error(error.message)
  return (data ?? []) as DexcomEgv[]
}

export async function getEgvsInRange(start: Date, end: Date): Promise<DexcomEgv[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('dexcom_egvs')
    .select('*')
    .gte('system_time', start.toISOString())
    .lte('system_time', end.toISOString())
    .order('system_time', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as DexcomEgv[]
}
