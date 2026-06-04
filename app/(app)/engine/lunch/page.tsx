import { createServerClient } from '@/lib/supabase/server'
import { LunchBuilder } from '@/components/t1d/lunch-builder'
import Link from 'next/link'
import type { T1dFoodRepo } from '@/types/health'

export const dynamic = 'force-dynamic'

export default async function EngineLunchPage() {
  const supabase = createServerClient()
  const { data: foodData } = await supabase
    .from('t1d_food_repo')
    .select('*')
    .eq('active', true)
    .order('name')

  const foodRepo = (foodData ?? []) as T1dFoodRepo[]

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
      <LunchBuilder foodRepo={foodRepo} />
    </div>
  )
}
