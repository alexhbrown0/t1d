import { createServerClient } from '@/lib/supabase/server'

const DEXCOM_TOKEN_URL = 'https://api.dexcom.com/v2/oauth2/token'

export function getDexcomAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.DEXCOM_CLIENT_ID!,
    redirect_uri: process.env.DEXCOM_REDIRECT_URI!,
    response_type: 'code',
    scope: 'offline_access egv calibration device statistics event',
  })
  return `https://api.dexcom.com/v2/oauth2/login?${params}`
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(DEXCOM_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.DEXCOM_CLIENT_ID!,
      client_secret: process.env.DEXCOM_CLIENT_SECRET!,
      redirect_uri: process.env.DEXCOM_REDIRECT_URI!,
      grant_type: 'authorization_code',
      code,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Dexcom token exchange failed: ${res.status} ${text}`)
  }

  return res.json() as Promise<{
    access_token: string
    refresh_token: string
    expires_in: number
    token_type: string
  }>
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(DEXCOM_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.DEXCOM_CLIENT_ID!,
      client_secret: process.env.DEXCOM_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Dexcom token refresh failed: ${res.status} ${text}`)
  }

  return res.json() as Promise<{
    access_token: string
    refresh_token: string
    expires_in: number
  }>
}

export async function storeTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  scope?: string
) {
  const supabase = createServerClient()
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  const { error } = await supabase.from('dexcom_auth').upsert({
    id: 1,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    scope: scope ?? null,
    updated_at: new Date().toISOString(),
  })

  if (error) throw new Error(`Failed to store Dexcom tokens: ${error.message}`)
}

export async function getValidAccessToken(): Promise<string> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('dexcom_auth')
    .select('*')
    .eq('id', 1)
    .single()

  if (error || !data) throw new Error('No Dexcom auth found — complete OAuth setup first')

  const expiresAt = new Date(data.expires_at).getTime()
  const nowPlus5Min = Date.now() + 5 * 60 * 1000

  if (expiresAt > nowPlus5Min) {
    return data.access_token
  }

  const refreshed = await refreshAccessToken(data.refresh_token)
  await storeTokens(refreshed.access_token, refreshed.refresh_token, refreshed.expires_in, data.scope)
  return refreshed.access_token
}
