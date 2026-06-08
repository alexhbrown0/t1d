import { createServerClient } from '@/lib/supabase/server'
import { getCentralTime, getCentralDateStr } from '@/lib/utils/central-time'
import type { T1dSchoolSchedule, T1dDailyOverride } from '@/types/health'

function nowMinutes(): number {
  return getCentralTime().minutesSinceMidnight
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

async function getTodaySchedule(): Promise<T1dSchoolSchedule[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('t1d_school_schedule')
    .select('*')
    .eq('day_of_week', getCentralTime().dayOfWeek)
    .eq('active', true)
    .order('start_time')
  if (error) throw new Error(error.message)
  return (data ?? []) as T1dSchoolSchedule[]
}

async function getTodayOverride(): Promise<T1dDailyOverride | null> {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('t1d_daily_overrides')
    .select('*')
    .eq('override_date', getCentralDateStr())
    .maybeSingle()
  return (data ?? null) as T1dDailyOverride | null
}

function applyOverride(
  schedule: T1dSchoolSchedule[],
  override: T1dDailyOverride | null
): T1dSchoolSchedule[] {
  if (!override) return schedule
  return schedule
    .filter(s => !(override.pe_cancelled && s.event_type === 'pe'))
    .map(s => {
      if (s.event_type === 'pe' && override.pe_start_time) {
        return { ...s, start_time: override.pe_start_time, end_time: override.pe_end_time ?? s.end_time }
      }
      if (s.event_type === 'lunch' && override.lunch_start_time) {
        return { ...s, start_time: override.lunch_start_time }
      }
      return s
    })
}

export async function getScheduleNext2h(): Promise<T1dSchoolSchedule[]> {
  return getScheduleNextN(120)
}

export async function getScheduleNextN(minutes: number): Promise<T1dSchoolSchedule[]> {
  const [schedule, override] = await Promise.all([getTodaySchedule(), getTodayOverride()])
  const effective = applyOverride(schedule, override)
  const now = nowMinutes()
  const windowEnd = now + minutes
  return effective.filter(s => {
    const start = timeToMinutes(s.start_time)
    const end = timeToMinutes(s.end_time)
    return end >= now && start <= windowEnd
  })
}

export async function getImminentHighActivity(withinMinutes: number): Promise<T1dSchoolSchedule[]> {
  const [schedule, override] = await Promise.all([getTodaySchedule(), getTodayOverride()])
  const effective = applyOverride(schedule, override)
  const now = nowMinutes()
  const windowEnd = now + withinMinutes
  return effective.filter(s => {
    if (s.activity_level !== 'high') return false
    const start = timeToMinutes(s.start_time)
    return start >= now && start <= windowEnd
  })
}
