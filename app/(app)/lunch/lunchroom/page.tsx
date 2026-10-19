import { createServerClient } from '@/lib/supabase/server'
import { getCentralDateStr } from '@/lib/utils/central-time'
import { getLunchTargetDate } from '@/lib/t1d/lunch-date'
import { LunchroomVerify } from '@/components/t1d/lunchroom-verify'
import type { T1dCafeteriaMenuItem } from '@/types/health'

export const dynamic = 'force-dynamic'

export default async function LunchroomPage() {
  const supabase = createServerClient()
  // Match the lunch tile: in the evening we're setting up tomorrow's lunch.
  const { packingForTomorrow, saveTimestamp, targetLabel } = getLunchTargetDate()
  const targetDate = getCentralDateStr(packingForTomorrow ? 1 : 0)

  const [menuRes, allMenuRes] = await Promise.all([
    supabase.from('t1d_cafeteria_menu').select('*').eq('menu_date', targetDate).order('carbs_g', { ascending: false }),
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
      <LunchroomVerify menu={menu} stapleNames={stapleNames} saveTimestamp={saveTimestamp.toISOString()} dayLabel={packingForTomorrow ? `tomorrow (${targetLabel})` : 'today'} />
    </div>
  )
}
