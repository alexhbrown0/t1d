import { NextRequest, NextResponse } from 'next/server'
import { getDexcomAuthUrl, exchangeCodeForTokens, storeTokens } from '@/lib/dexcom/auth'

// GET /api/auth/dexcom          → redirect to Dexcom OAuth
// GET /api/auth/dexcom?code=... → callback, exchange code, store tokens
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.json({ error }, { status: 400 })
  }

  if (!code) {
    return NextResponse.redirect(getDexcomAuthUrl())
  }

  const tokens = await exchangeCodeForTokens(code)
  await storeTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in)

  return NextResponse.redirect(new URL('/t1d/admin', req.nextUrl.origin))
}
