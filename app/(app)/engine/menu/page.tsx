import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { MenuUploader } from '@/components/t1d/menu-uploader'

export const dynamic = 'force-dynamic'

export default async function CafeteriaMenuPage() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('t1d_cafeteria_menu')
    .select('menu_date')
    .order('menu_date', { ascending: true })

  const existingDates = [...new Set((data ?? []).map(r => r.menu_date as string))]

  return (
    <div className="px-4 pt-5 pb-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/engine" className="text-gray-500 flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div>
          <p className="text-[10px] tracking-widest text-teal-400 font-semibold">CAFETERIA MENU</p>
          <p className="text-lg font-semibold text-white">Upload Monthly Menu</p>
        </div>
      </div>
      <MenuUploader existingDates={existingDates} />
    </div>
  )
}
