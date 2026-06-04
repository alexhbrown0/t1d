import { createServerClient } from '@/lib/supabase/server'
import { LunchBuilder } from '@/components/t1d/lunch-builder'
import type { RecentItem } from '@/components/t1d/lunch-builder'
import Link from 'next/link'
import type { T1dFoodRepo, MealItem } from '@/types/health'

export const dynamic = 'force-dynamic'

export default async function EngineLunchPage() {
  const supabase = createServerClient()

  const twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  const [foodRes, recentMealsRes] = await Promise.all([
    supabase.from('t1d_food_repo').select('*').eq('active', true).order('name'),
    supabase
      .from('t1d_meal_events')
      .select('items_offered')
      .eq('context', 'school_lunch')
      .gte('timestamp', twoWeeksAgo.toISOString())
      .order('timestamp', { ascending: false })
      .limit(30),
  ])

  const foodRepo = (foodRes.data ?? []) as T1dFoodRepo[]

  // Tally item frequency across recent lunches
  const tally = new Map<string, { count: number; item: RecentItem }>()
  for (const meal of recentMealsRes.data ?? []) {
    for (const item of (meal.items_offered as MealItem[]) ?? []) {
      const existing = tally.get(item.name)
      if (existing) {
        existing.count++
      } else {
        // Try to match to food repo for accurate serving_size
        const repoMatch = foodRepo.find(f => f.id === item.food_repo_id || f.name === item.name)
        tally.set(item.name, {
          count: 1,
          item: {
            food_repo_id: item.food_repo_id,
            name: item.name,
            carbs: repoMatch?.carbs_g ?? item.carbs,
            fat: repoMatch?.fat_g ?? item.fat,
            protein: repoMatch?.protein_g ?? item.protein,
            serving_size: repoMatch?.serving_size ?? '1 serving',
          },
        })
      }
    }
  }

  const recentItems: RecentItem[] = [...tally.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(t => t.item)

  return (
    <div className="px-4 pt-5 pb-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/engine" className="text-gray-500 flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div>
          <p className="text-[10px] tracking-widest text-teal-400 font-semibold">PACK LUNCH</p>
          <p className="text-lg font-semibold text-white">Today&apos;s Lunch</p>
        </div>
      </div>
      <LunchBuilder foodRepo={foodRepo} recentItems={recentItems} />
    </div>
  )
}
