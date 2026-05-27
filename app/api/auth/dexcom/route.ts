import { NextResponse } from 'next/server'
import { getDexcomAuthUrl } from '@/lib/dexcom/auth'

export async function GET() {
  return NextResponse.redirect(getDexcomAuthUrl())
}
