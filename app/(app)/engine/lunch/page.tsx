import { createServerClient } from '@/lib/supabase/server'
import { getLunchTargetDate } from '@/lib/t1d/lunch-date'
import { LunchPackMode } from '@/components/t1d/lunch-pack-mode'
import type { RecentItem, ItemStat, LunchRecipe } from '@/components/t1d/lunch-builder'
import Link from 'next/link'
import type { T1dFoodRepo, MealItem, T1dCafeteriaMenuItem } from '@/types/health'

export const dynamic = 'force-dynamic'

export default async function EngineLunchPage() {
  const supabase = createServerClient()

  const now = new Date()
  const { packingForTomorrow, targetDate, targetEnd, saveTimestamp, targetLabel } = getLunchTargetDate()

  const twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  const targetDateStr = targetDate.toISOString().slice(0, 10)

  const [foodRes, existingMealRes, recipesRes, recentMealsRes, menuRes, allMenuRes] = await Promise.all([
    supabase.from('t1d_food_repo').select('*').eq('active', true).order('name'),
    // Load existing meal event for target date (so user can continue packing)
    supabase
      .from('t1d_meal_events')
      .select('*')
      .eq('context', 'school_lunch')
      .gte('timestamp', targetDate.toISOString())
      .lt('timestamp', targetEnd.toISOString())
      .order('timestamp', { ascending: false })
      .limit(1),
    supabase.from('t1d_recipes').select('id,name,carbs_per_piece,fat_per_piece,protein_per_piece,yield_unit,carbs_per_100g,fat_per_100g,protein_per_100g,typical_serving_g,typical_serving_description').eq('active', true).order('name'),
    // Historical meals for recent items + stats
    supabase
      .from('t1d_meal_events')
      .select('timestamp, items_offered')
      .eq('context', 'school_lunch')
      .gte('timestamp', twoWeeksAgo.toISOString())
      .lt('timestamp', targetDate.toISOString()) // exclude today/target
      .order('timestamp', { ascending: false })
      .limit(30),
    supabase.from('t1d_cafeteria_menu').select('*').eq('menu_date', targetDateStr).order('carbs_g', { ascending: false }),
    supabase.from('t1d_cafeteria_menu').select('menu_date, name'),
  ])

  const foodRepo = (foodRes.data ?? []) as T1dFoodRepo[]
  const recipes = (recipesRes.data ?? []) as LunchRecipe[]
  const menu = (menuRes.data ?? []) as T1dCafeteriaMenuItem[]

  // Staples = items that recur on >=50% of menu days (PB&J, milk, chips, etc.) — kept in
  // a separate "always available" section so the day's featured items stand out.
  const allMenu = (allMenuRes.data ?? []) as Array<{ menu_date: string; name: string }>
  const allDates = new Set(allMenu.map(r => r.menu_date))
  const nameDates = new Map<string, Set<string>>()
  for (const r of allMenu) {
    if (!nameDates.has(r.name)) nameDates.set(r.name, new Set())
    nameDates.get(r.name)!.add(r.menu_date)
  }
  const stapleNames = allDates.size > 0
    ? [...nameDates.entries()].filter(([, dates]) => dates.size / allDates.size >= 0.5).map(([name]) => name)
    : []

  const existingMeal = existingMealRes.data?.[0] ?? null
  const initialCafeteria = existingMeal?.is_cafeteria ?? false
  const initialSelectedNames = existingMeal && initialCafeteria
    ? (existingMeal.items_offered as MealItem[]).map(i => i.name)
    : []
  const initialPacked = existingMeal
    ? (existingMeal.items_offered as MealItem[]).map(i => ({
        food_repo_id: i.food_repo_id,
        name: i.name,
        carbs: i.carbs,
        fat: i.fat ?? null,
        protein: i.protein ?? null,
        qty: i.qty_offered,
        serving_size: foodRepo.find(f => f.id === i.food_repo_id)?.serving_size ?? '1 serving',
      }))
    : []

  // Tally frequency + last served per item
  const tally = new Map<string, { count: number; lastServed: string; item: RecentItem }>()
  for (const meal of recentMealsRes.data ?? []) {
    for (const item of (meal.items_offered as MealItem[]) ?? []) {
      const key = item.food_repo_id ?? item.name
      const repoMatch = foodRepo.find(f =>
        f.id === item.food_repo_id ||
        f.name.toLowerCase() === item.name.toLowerCase() ||
        f.name.toLowerCase().includes(item.name.toLowerCase()) ||
        item.name.toLowerCase().includes(f.name.toLowerCase().slice(0, 8))
      )
      const existing = tally.get(key)
      if (existing) {
        existing.count++
        if (meal.timestamp > existing.lastServed) existing.lastServed = meal.timestamp
      } else {
        tally.set(key, {
          count: 1,
          lastServed: meal.timestamp,
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
  }

  const recentItems: RecentItem[] = [...tally.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(t => t.item)

  // Stats map keyed by food_repo_id or name
  const itemStats: Record<string, ItemStat> = {}
  for (const [key, val] of tally.entries()) {
    const daysAgo = Math.round((now.getTime() - new Date(val.lastServed).getTime()) / 86400000)
    itemStats[key] = { daysAgo, timesServed: val.count }
  }

  const targetLabelFull = `${packingForTomorrow ? 'Tomorrow' : 'Today'} · ${targetLabel}`

  return (
    <div className="px-4 pt-5 pb-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/engine" className="text-gray-500 flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div>
          <p className="text-[10px] tracking-widest text-teal-400 font-semibold">PACK LUNCH · {targetLabelFull.toUpperCase()}</p>
          <p className="text-lg font-semibold text-white">
            {existingMeal ? 'Continue Packing' : "Today's Lunch"}
          </p>
        </div>
      </div>
      <LunchPackMode
        foodRepo={foodRepo}
        recentItems={recentItems}
        itemStats={itemStats}
        initialPacked={initialPacked}
        existingMealId={existingMeal?.id ?? null}
        saveTimestamp={saveTimestamp.toISOString()}
        recipes={recipes}
        menu={menu}
        stapleNames={stapleNames}
        initialCafeteria={initialCafeteria}
        initialSelectedNames={initialSelectedNames}
        targetLabel={targetLabel}
      />
    </div>
  )
}
