import { NextRequest, NextResponse } from 'next/server'
import { ingestRecentEgvs, fetchDataRange, fetchEgvs } from '@/lib/dexcom/client'
import { ingestViaShare } from '@/lib/dexcom/share'
import { checkPendingDoses } from '@/lib/t1d/pending-dose-monitor'
import { generateInsight } from '@/lib/t1d/insight'

function isAuthorized(req: NextRequest): boolean {
  const cronAuth = req.headers.get('authorization')
  const manualSecret = req.headers.get('x-cron-secret')
  return cronAuth === `Bearer ${process.env.CRON_SECRET}` || manualSecret === process.env.CRON_SECRET
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const useShare = !!(process.env.DEXCOM_ACCOUNT_NAME && process.env.DEXCOM_PASSWORD)
    const [ingest, monitor] = await Promise.all([
      useShare ? ingestViaShare() : ingestRecentEgvs(),
      checkPendingDoses(),
    ])
    generateInsight().catch(() => null) // fire-and-forget, don't block ingest response
    return NextResponse.json({ ok: true, ingest, monitor })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const end = new Date()
    const start = new Date(end.getTime() - 3 * 60 * 60 * 1000)
    const startIso = start.toISOString().replace(/\.\d{3}Z$/, '')
    const endIso = end.toISOString().replace(/\.\d{3}Z$/, '')
    const [range, egvs] = await Promise.all([
      fetchDataRange(),
      fetchEgvs(startIso, endIso),
    ])
    return NextResponse.json({ range, egvs, startIso, endIso })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
