import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, storeTokens } from '@/lib/dexcom/auth'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.json({ error }, { status: 400 })
  }

  if (!code) {
    return NextResponse.json({ error: 'No code returned from Dexcom' }, { status: 400 })
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    await storeTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in)
    return NextResponse.redirect(new URL('/now', req.nextUrl.origin))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
