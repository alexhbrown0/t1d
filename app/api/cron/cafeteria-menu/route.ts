import { NextRequest, NextResponse } from 'next/server'
import { syncCafeteriaMenu } from '@/lib/t1d/snaf-menu'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Pulls Brooks's school lunch menu (with real carbs) from the district's
// schoolnutritionandfitness.com GraphQL API into t1d_cafeteria_menu.
// Runs daily via cron; also triggerable manually with x-cron-secret.
export async function GET(req: NextRequest) {
  const cronAuth = req.headers.get('authorization')
  const manualSecret = req.headers.get('x-cron-secret')
  const ok = cronAuth === `Bearer ${process.env.CRON_SECRET}` || manualSecret === process.env.CRON_SECRET
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await syncCafeteriaMenu()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/cafeteria-menu] sync failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'sync failed' }, { status: 502 })
  }
}
