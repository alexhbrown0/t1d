import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { getCentralDayStartUTC, getSnackWeekStartUTC } from '@/lib/utils/central-time'
import { SnackFlow } from '@/components/t1d/snack-flow'
import type { T1dFoodRepo, MealItem, T1dDoseSession, PackedSnack } from '@/types/health'

export const dynamic = 'force-dynamic'

interface PackedRow {
  food_repo_id: string | null
  name: string
  carbs_g: number
  fat_g: number | null
  protein_g: number | null
  serving_size: string
  qty: number
  packed_at: string
}

export default async function SnackPage() {
  const supabase = createServerClient()
  const todayStart = getCentralDayStartUTC()

  const [foodRes, todayRes, packedRes] = await Promise.all([
    supabase.from('t1d_food_repo').select('*').eq('active', true).order('name'),
    supabase
      .from('t1d_meal_events')
      .select('*')
      .eq('context', 'snack')
      .gte('timestamp', todayStart.toISOString())
      .order('timestamp', { ascending: false })
      .limit(1),
    supabase.from('t1d_packed_snacks').select('*').order('position', { ascending: true }),
  ])

  const foodRepo = (foodRes.data ?? []) as T1dFoodRepo[]
  const todayMeal = todayRes.data?.[0] ?? null

  const allPackedRows = (packedRes.data ?? []) as PackedRow[]
  // Stale packs (from before this pack week / last Friday) are ignored so each week starts fresh.
  const packStale = allPackedRows.length > 0 && new Date(allPackedRows[0].packed_at) < getSnackWeekStartUTC()
  const packedRows = packStale ? [] : allPackedRows
  const packedSnacks: PackedSnack[] = packedRows.map(p => ({
    food_repo_id: p.food_repo_id,
    name: p.name,
    carbs: p.carbs_g,
    fat: p.fat_g,
    protein: p.protein_g,
    serving_size: p.serving_size,
    qty: p.qty ?? 1,
  }))
  const packedAt = packedRows[0]?.packed_at ?? null

  let existing = null
  if (todayMeal) {
    const { data: sessions } = await supabase
      .from('t1d_dose_sessions')
      .select('*')
      .eq('meal_event_id', todayMeal.id)
      .order('created_at', { ascending: false })
      .limit(1)
    const s = (sessions?.[0] as T1dDoseSession) ?? null
    const items = (todayMeal.items_offered as MealItem[]) ?? []
    existing = {
      meal_id: todayMeal.id,
      session_id: s?.id ?? null,
      recommended_dose_grams: s?.recommended_dose_grams ?? null,
      actual_dose_grams: s?.actual_dose_grams ?? null,
      item_name: items.map(i => i.name).join(', ') || null,
      total_carbs: todayMeal.total_offered_carbs ?? null,
    }
  }

  return (
    <div className="px-4 pt-5 pb-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/now" className="text-gray-500 flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div>
          <p className="text-[10px] tracking-widest text-teal-400 font-semibold">MORNING SNACK</p>
          <p className="text-lg font-semibold text-white">Dose Snack</p>
        </div>
      </div>
      <SnackFlow foodRepo={foodRepo} packedSnacks={packedSnacks} packedAt={packedAt} existing={existing} />
    </div>
  )
}
