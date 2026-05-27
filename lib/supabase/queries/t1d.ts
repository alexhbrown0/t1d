import { createServerClient } from '@/lib/supabase/server'
import type {
  T1dEngineParams,
  T1dFoodRepo,
  LearnedStrategy,
  MealItem,
  SimilarFoodOutcome,
} from '@/types/health'

export async function getCurrentEngineParams(): Promise<T1dEngineParams> {
  const supabase = createServerClient()
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('t1d_engine_params')
    .select('*')
    .lte('effective_from', today)
    .order('effective_from', { ascending: false })
    .limit(1)
    .single()
  if (error || !data) throw new Error('No engine params found — seed initial params first')
  return data as T1dEngineParams
}

export async function getFoodRepo(): Promise<T1dFoodRepo[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('t1d_food_repo')
    .select('*')
    .eq('active', true)
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as T1dFoodRepo[]
}

export async function getRecentFastCarbs(): Promise<{ carbs_g: number; logged_at: string } | null> {
  const supabase = createServerClient()
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('t1d_low_treatments')
    .select('treatment_carbs_g, created_at')
    .gte('created_at', since)
    .not('treatment_carbs_g', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return { carbs_g: data.treatment_carbs_g as number, logged_at: data.created_at as string }
}

export async function getRecentBoluses(withinHours: number) {
  const supabase = createServerClient()
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('t1d_dose_sessions')
    .select('actual_dose_grams, actual_dose_timestamp')
    .gte('actual_dose_timestamp', since)
    .not('actual_dose_grams', 'is', null)
    .order('actual_dose_timestamp', { ascending: false })
  return (data ?? []) as { actual_dose_grams: number; actual_dose_timestamp: string }[]
}

// Build a map of food_repo_id → LearnedStrategy for quick lookup
export function buildPlaybookMap(foods: T1dFoodRepo[]): Record<string, LearnedStrategy> {
  const map: Record<string, LearnedStrategy> = {}
  for (const f of foods) {
    if (f.learned_strategy) map[f.id] = f.learned_strategy
  }
  return map
}

// Find foods with similar macro/GI profile using Euclidean distance on normalized macro ratios
export function getSimilarFoods(mealItems: MealItem[], allFoods: T1dFoodRepo[]): SimilarFoodOutcome[] {
  if (mealItems.length === 0 || allFoods.length === 0) return []

  const totalCarbs = mealItems.reduce((s, i) => s + i.carbs, 0)
  const totalFat = mealItems.reduce((s, i) => s + (i.fat ?? 0), 0)
  const totalProtein = mealItems.reduce((s, i) => s + (i.protein ?? 0), 0)
  const mealTotal = totalCarbs + totalFat + totalProtein || 1

  const mealCarbPct = totalCarbs / mealTotal
  const mealFatPct = totalFat / mealTotal
  const mealProteinPct = totalProtein / mealTotal

  const mealItemIds = new Set(mealItems.map(i => i.food_repo_id).filter(Boolean))

  return allFoods
    .filter(f => !mealItemIds.has(f.id) && f.learned_strategy && f.learned_strategy.n_meals >= 3)
    .map(f => {
      const ft = f.carbs_g + (f.fat_g ?? 0) + (f.protein_g ?? 0) || 1
      const dist = Math.sqrt(
        Math.pow(f.carbs_g / ft - mealCarbPct, 2) +
        Math.pow((f.fat_g ?? 0) / ft - mealFatPct, 2) +
        Math.pow((f.protein_g ?? 0) / ft - mealProteinPct, 2)
      )
      return { food: f, dist }
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 5)
    .map(({ food: f }) => ({
      name: f.name,
      gi_estimate: f.gi_estimate,
      gi_category: f.gi_category,
      carbs_g: f.carbs_g,
      fat_g: f.fat_g,
      protein_g: f.protein_g,
      n_meals: f.learned_strategy!.n_meals,
      pct_good: f.learned_strategy!.pct_good,
      avg_peak_mgdl: f.learned_strategy!.avg_peak_mgdl,
      avg_peak_minutes: f.learned_strategy!.avg_peak_minutes,
    }))
}
