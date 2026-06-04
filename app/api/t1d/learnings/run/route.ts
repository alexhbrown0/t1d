import { NextResponse } from 'next/server'

// Fire-and-forget proxy — the analysis takes 30-60s so we return immediately
// and let the client poll/reload for results
export async function POST() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  // Start the analysis but don't await it
  fetch(`${baseUrl}/api/claude/t1d-daily-learning`, {
    method: 'POST',
    headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
  }).catch(() => null)

  return NextResponse.json({ status: 'started' })
}
