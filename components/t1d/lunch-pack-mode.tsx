'use client'

import { useState } from 'react'
import { LunchBuilder } from '@/components/t1d/lunch-builder'
import { CafeteriaBuilder } from '@/components/t1d/cafeteria-builder'
import type { RecentItem, ItemStat, PackedItem, LunchRecipe } from '@/components/t1d/lunch-builder'
import type { T1dFoodRepo, T1dCafeteriaMenuItem } from '@/types/health'

type Mode = 'home' | 'cafeteria'

export function LunchPackMode(props: {
  foodRepo: T1dFoodRepo[]
  recentItems: RecentItem[]
  itemStats: Record<string, ItemStat>
  initialPacked: PackedItem[]
  existingMealId: string | null
  saveTimestamp: string
  recipes: LunchRecipe[]
  menu: T1dCafeteriaMenuItem[]
  stapleNames: string[]
  initialCafeteria: boolean
  initialSelectedNames: string[]
  targetLabel: string
}) {
  const [mode, setMode] = useState<Mode>(props.initialCafeteria ? 'cafeteria' : 'home')

  return (
    <div className="space-y-4">
      <div className="flex w-full gap-1 bg-white/5 rounded-xl p-1">
        <button onClick={() => setMode('home')}
          className={`flex-1 text-[11px] font-semibold py-2 rounded-lg ${mode === 'home' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>
          Pack from home
        </button>
        <button onClick={() => setMode('cafeteria')}
          className={`flex-1 text-[11px] font-semibold py-2 rounded-lg ${mode === 'cafeteria' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>
          Eating in cafeteria
        </button>
      </div>

      {mode === 'home' ? (
        <LunchBuilder
          foodRepo={props.foodRepo}
          recentItems={props.recentItems}
          itemStats={props.itemStats}
          initialPacked={props.initialPacked}
          existingMealId={props.existingMealId}
          saveTimestamp={props.saveTimestamp}
          recipes={props.recipes}
        />
      ) : (
        <CafeteriaBuilder
          menu={props.menu}
          stapleNames={props.stapleNames}
          existingMealId={props.existingMealId}
          initialSelectedNames={props.initialSelectedNames}
          saveTimestamp={props.saveTimestamp}
          targetLabel={props.targetLabel}
        />
      )}
    </div>
  )
}
