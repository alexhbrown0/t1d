import { claude } from '@/lib/claude/client'
import { buildDoseEngineSystemPrompt, buildDoseEngineUserContext } from '@/lib/claude/prompts/t1d'
import { getLatestEgvs } from '@/lib/dexcom/client'
import { getScheduleNextN, getImminentHighActivity } from '@/lib/t1d/schedule'
import {
  getCurrentEngineParams,
  getFoodRepo,
  getRecentFastCarbs,
  getRecentBoluses,
  buildPlaybookMap,
  getSimilarFoods,
} from '@/lib/supabase/queries/t1d'
import type { MealItem, EngineOutput } from '@/types/health'

interface EngineContext {
  mealGiCategory?: string | null
  lowTreatmentCarbs?: number | null
  lowTreatmentType?: string | null
  startingBg?: number | null
  startingTrend?: string | null
}

export async function runDoseEngine(meal: MealItem[], ctx: EngineContext = {}): Promise<EngineOutput> {
  const [params, egvs, schedule, recentFastCarbs, allFoods] = await Promise.all([
    getCurrentEngineParams(),
    getLatestEgvs(5),
    getScheduleNextN(240),
    getRecentFastCarbs(),
    getFoodRepo(),
  ])

  const recentBoluses = await getRecentBoluses(params.current_dia ?? 3.5)
  const foodPlaybooks = buildPlaybookMap(allFoods)
  const similarFoodOutcomes = getSimilarFoods(meal, allFoods)

  const systemPrompt = buildDoseEngineSystemPrompt(params, params.clinical_notes)
  const userContext = buildDoseEngineUserContext({
    meal,
    last5Egvs: egvs.map(e => ({ system_time: e.system_time, value_mgdl: e.value_mgdl })),
    scheduleNext2h: schedule,
    recentFastCarbs,
    foodPlaybooks,
    similarFoodOutcomes,
    recentBoluses,
    params,
    ...ctx,
  })

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userContext }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  return JSON.parse(json) as EngineOutput
}
