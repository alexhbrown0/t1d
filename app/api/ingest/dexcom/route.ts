import { NextRequest, NextResponse } from 'next/server'
import { ingestRecentEgvs, fetchDataRange } from '@/lib/dexcom/client'
import { checkPendingDoses } from '@/lib/t1d/pending-dose-monitor'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [ingest, monitor] = await Promise.all([
      ingestRecentEgvs(),
      checkPendingDoses(),
    ])
    return NextResponse.json({ ok: true, ingest, monitor })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const range = await fetchDataRange()
    return NextResponse.json(range)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
