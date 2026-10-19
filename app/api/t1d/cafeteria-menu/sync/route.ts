import { NextResponse } from 'next/server'
import { syncCafeteriaMenu } from '@/lib/t1d/snaf-menu'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// On-demand pull of the school menu (current + next month) from the district
// GraphQL API. Same work the daily cron does; callable from the Engine screen.
export async function POST() {
  try {
    const result = await syncCafeteriaMenu()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cafeteria-menu/sync] failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'sync failed' }, { status: 502 })
  }
}
