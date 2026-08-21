import { createServerClient } from '@/lib/supabase/server'
import { getCentralDateStr } from '@/lib/utils/central-time'
import { LunchroomVerify } from '@/components/t1d/lunchroom-verify'
import type { T1dCafeteriaMenuItem } from '@/types/health'

export const dynamic = 'force-dynamic'

export default async function LunchroomPage() {
  const supabase = createServerClient()
  const todayDate = getCentralDateStr()

  const [menuRes, allMenuRes] = await Promise.all([
    supabase.from('t1d_cafeteria_menu').select('*').eq('menu_date', todayDate).order('carbs_g', { ascending: false }),
    supabase.from('t1d_cafeteria_menu').select('menu_date, name'),
  ])

  const menu = (menuRes.data ?? []) as T1dCafeteriaMenuItem[]
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

  return (
    <div className="px-4 pt-5 pb-6">
      <LunchroomVerify menu={menu} stapleNames={stapleNames} />
    </div>
  )
}
