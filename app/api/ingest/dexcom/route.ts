import { NextRequest, NextResponse } from 'next/server'
import { ingestRecentEgvs } from '@/lib/dexcom/client'
import { checkPendingDoses } from '@/lib/t1d/pending-dose-monitor'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [ingest, monitor] = await Promise.all([
    ingestRecentEgvs(),
    checkPendingDoses(),
  ])

  return NextResponse.json({ ok: true, ingest, monitor })
}
