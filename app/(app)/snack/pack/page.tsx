import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { getSnackWeekStartUTC } from '@/lib/utils/central-time'
import { SnackPacker } from '@/components/t1d/snack-packer'
import type { RecentItem } from '@/components/t1d/lunch-builder'
import type { T1dFoodRepo, MealItem, PackedSnack } from '@/types/health'

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

export default async function SnackPackPage() {
  const supabase = createServerClient()
  const twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  const [foodRes, packedRes, recentRes] = await Promise.all([
    supabase.from('t1d_food_repo').select('*').eq('active', true).order('name'),
    supabase.from('t1d_packed_snacks').select('*').order('position', { ascending: true }),
    supabase
      .from('t1d_meal_events')
      .select('items_offered')
      .eq('context', 'snack')
      .gte('timestamp', twoWeeksAgo.toISOString())
      .order('timestamp', { ascending: false })
      .limit(40),
  ])

  const foodRepo = (foodRes.data ?? []) as T1dFoodRepo[]

  // Don't seed last week's stale set — start fresh after Friday.
  const allPacked = (packedRes.data ?? []) as PackedRow[]
  const packStale = allPacked.length > 0 && new Date(allPacked[0].packed_at) < getSnackWeekStartUTC()
  const initialPacked: PackedSnack[] = (packStale ? [] : allPacked).map(p => ({
    food_repo_id: p.food_repo_id,
    name: p.name,
    carbs: p.carbs_g,
    fat: p.fat_g,
    protein: p.protein_g,
    serving_size: p.serving_size,
    qty: p.qty ?? 1,
  }))

  // Recent snack items by frequency
  const tally = new Map<string, { count: number; item: RecentItem }>()
  for (const meal of recentRes.data ?? []) {
    for (const item of (meal.items_offered as MealItem[]) ?? []) {
      const key = item.food_repo_id ?? item.name
      const repoMatch = foodRepo.find(f => f.id === item.food_repo_id || f.name.toLowerCase() === item.name.toLowerCase())
      const existing = tally.get(key)
      if (existing) existing.count++
      else tally.set(key, {
        count: 1,
        item: {
          food_repo_id: item.food_repo_id,
          name: item.name,
          carbs: repoMatch?.carbs_g ?? item.carbs,
          fat: repoMatch?.fat_g ?? item.fat,
          protein: repoMatch?.protein_g ?? item.protein,
          serving_size: repoMatch?.serving_size ?? '',
        },
      })
    }
  }
  const recentItems = [...tally.values()].sort((a, b) => b.count - a.count).slice(0, 10).map(t => t.item)

  return (
    <div className="px-4 pt-5 pb-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/snack" className="text-gray-500 flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div>
          <p className="text-[10px] tracking-widest text-teal-400 font-semibold">PACK THIS WEEK</p>
          <p className="text-lg font-semibold text-white">This Week&apos;s Snacks</p>
        </div>
      </div>
      <SnackPacker foodRepo={foodRepo} initialPacked={initialPacked} recentItems={recentItems} />
    </div>
  )
}
