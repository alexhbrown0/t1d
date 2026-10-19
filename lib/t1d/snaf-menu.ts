import { createServerClient } from '@/lib/supabase/server'
import { getCentralTime } from '@/lib/utils/central-time'

// Brooks's school on schoolnutritionandfitness.com (hardcoded — he won't move).
// From the mobile app URL /school/1501710078930/3911/4742 → site depth ids.
const SNAF_GRAPHQL = 'https://api.schoolnutritionandfitness.com/graphql'
const SITE_DEPTH_0 = '3911'
const SITE_DEPTH_1 = '4742'

// Cloudflare + the app's own gate require these headers.
const SNAF_HEADERS = {
  'Content-Type': 'application/json',
  'X-Mobile-App': 'webmenus-mobile-app',
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Origin': 'https://www.schoolnutritionandfitness.com',
  'Referer': 'https://www.schoolnutritionandfitness.com/mobile/',
}

const MENU_QUERY = `query($s:String!,$e:String!,$a:String!,$b:String!){
  menuTypes(publish_location:"mobile", site:{depth_0_id:$a, depth_1_id:$b}){
    name
    items(start_date:$s,end_date:$e){
      date
      product{ name category prod_carbs is_ancillary hide_on_mobile }
    }
  }
}`

// SNAF category → our cafeteria-builder categories (entree|side|milk|condiment|other)
function mapCategory(c: string | null | undefined): string {
  switch ((c ?? '').toLowerCase()) {
    case 'entrees': case 'entree': return 'entree'
    case 'vegetable': case 'grain': case 'fruit': return 'side'
    case 'milk': return 'milk'
    case 'condiment': return 'condiment'
    default: return 'other'
  }
}

// "10/1/2026" → "2026-10-01"
function toIsoDate(mdy: string): string | null {
  const m = mdy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, mm, dd, yyyy] = m
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

interface SnafItem { date: string; product: { name: string; category: string | null; prod_carbs: number | null; is_ancillary: boolean | null; hide_on_mobile: boolean | null } | null }

interface MenuRow { menu_date: string; name: string; carbs_g: number; category: string }

async function fetchMonth(year: number, month: number): Promise<MenuRow[]> {
  const mm = String(month).padStart(2, '0')
  const start = `${mm}/01/${year}`
  const end = `${mm}/31/${year}`
  const res = await fetch(SNAF_GRAPHQL, {
    method: 'POST',
    headers: SNAF_HEADERS,
    body: JSON.stringify({ query: MENU_QUERY, variables: { s: start, e: end, a: SITE_DEPTH_0, b: SITE_DEPTH_1 } }),
  })
  if (!res.ok) throw new Error(`SNAF ${res.status}`)
  const json = await res.json() as { data?: { menuTypes?: Array<{ items?: SnafItem[] }> }; errors?: unknown }
  if (json.errors) throw new Error(`SNAF GraphQL error: ${JSON.stringify(json.errors).slice(0, 200)}`)

  const seen = new Set<string>()
  const rows: MenuRow[] = []
  for (const mt of json.data?.menuTypes ?? []) {
    for (const it of mt.items ?? []) {
      const p = it.product
      if (!p || !p.name || p.prod_carbs == null) continue
      // Keep hide_on_mobile items: the school hides the repeating daily
      // grab-and-go kits / chocolate milk from the calendar view, but those
      // are real choices Brooks can get. Only drop true ancillary rows.
      if (p.is_ancillary) continue
      if ((p.category ?? '').toLowerCase() === 'ancillary') continue
      const iso = toIsoDate(it.date)
      if (!iso) continue
      const key = `${iso}|${p.name.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ menu_date: iso, name: p.name, carbs_g: Number(p.prod_carbs), category: mapCategory(p.category) })
    }
  }
  return rows
}

// Pulls the current + next month from the district site and replaces those
// months' rows in t1d_cafeteria_menu. Idempotent — safe to run daily.
export async function syncCafeteriaMenu(): Promise<{ months: string[]; dates: number; rows: number }> {
  const now = getCentralTime()
  const months: Array<[number, number]> = [
    [now.year, now.month],
    now.month === 12 ? [now.year + 1, 1] : [now.year, now.month + 1],
  ]

  const allRows: MenuRow[] = []
  for (const [y, m] of months) {
    allRows.push(...await fetchMonth(y, m))
  }

  const supabase = createServerClient()
  const dates = [...new Set(allRows.map(r => r.menu_date))]
  if (dates.length > 0) {
    await supabase.from('t1d_cafeteria_menu').delete().in('menu_date', dates)
    if (allRows.length > 0) {
      const { error } = await supabase.from('t1d_cafeteria_menu').insert(allRows)
      if (error) throw new Error(error.message)
    }
  }
  return { months: months.map(([y, m]) => `${y}-${String(m).padStart(2, '0')}`), dates: dates.length, rows: allRows.length }
}
