import { NextResponse } from 'next/server'

// Server-side proxy for triggering daily learning — keeps CRON_SECRET off the client
export async function POST() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/claude/t1d-daily-learning`, {
    method: 'POST',
    headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
  })
  if (!res.ok) {
    return NextResponse.json({ error: 'Learning run failed' }, { status: res.status })
  }
  const data = await res.json()
  return NextResponse.json(data)
}
