import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'

export const maxDuration = 30

export async function POST() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  // waitUntil keeps the function alive until the fetch completes,
  // even after we've already returned the response to the client
  waitUntil(
    fetch(`${baseUrl}/api/claude/t1d-daily-learning`, {
      method: 'POST',
      headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
    }).catch(() => null)
  )

  return NextResponse.json({ status: 'started' })
}
