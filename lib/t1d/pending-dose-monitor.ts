import { createServerClient } from '@/lib/supabase/server'
import { getLatestEgvs } from '@/lib/dexcom/client'
import type { T1dPendingDose } from '@/types/health'

export interface MonitorResult {
  checked: number
  nowReady: string[]  // pending dose IDs that just became ready
}

function isBgStabilized(egvs: { value_mgdl: number | null }[]): boolean {
  // egvs newest-first — need at least 3 readings
  if (egvs.length < 3) return false

  const [a, b, c] = egvs
  if (a.value_mgdl == null || b.value_mgdl == null || c.value_mgdl == null) return false

  const currentBg = a.value_mgdl
  if (currentBg < 80) return false

  const delta1 = a.value_mgdl - b.value_mgdl  // newest vs prior
  const delta2 = b.value_mgdl - c.value_mgdl  // prior vs one before

  // Rising: positive delta for 2 consecutive readings
  const rising = delta1 > 0 && delta2 > 0

  // Steady: absolute delta ≤ 5 for 2 consecutive readings
  const steady = Math.abs(delta1) <= 5 && Math.abs(delta2) <= 5

  return rising || steady
}

export async function checkPendingDoses(): Promise<MonitorResult> {
  const supabase = createServerClient()

  const { data: pending } = await supabase
    .from('t1d_pending_doses')
    .select('*')
    .eq('status', 'pending')

  if (!pending || pending.length === 0) return { checked: 0, nowReady: [] }

  const egvs = await getLatestEgvs(3)
  const stabilized = isBgStabilized(egvs)

  if (!stabilized) return { checked: pending.length, nowReady: [] }

  const ids = (pending as T1dPendingDose[]).map(p => p.id)

  await supabase
    .from('t1d_pending_doses')
    .update({ status: 'ready', resolved_at: new Date().toISOString() })
    .in('id', ids)

  return { checked: pending.length, nowReady: ids }
}
