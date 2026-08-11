import { getCentralTime } from '@/lib/utils/central-time'
import type { T1dSchoolSchedule } from '@/types/health'

export interface DayBlock {
  label: string
  start: string // "HH:MM"
  end: string   // "HH:MM"
  event_type: 'pe' | 'snack' | 'recess' | 'lunch' | null // dosing-relevant; null = plain academic block
  activity_level: 'high' | 'medium' | 'low' | null
}

// Brooks's 1st-grade weekly timetable — THE source of truth for schedule everywhere
// (the "where is he now" card, the Schedule page, and the dosing engine).
// Edit here when the school schedule changes — no DB migration needed.
const MORNING: DayBlock[] = [
  { label: 'Homeroom', start: '07:40', end: '07:55', event_type: null, activity_level: null },
  { label: 'Math', start: '07:55', end: '09:00', event_type: null, activity_level: null },
  { label: 'Specials', start: '09:00', end: '09:30', event_type: null, activity_level: null },
  { label: 'PE', start: '09:30', end: '10:00', event_type: 'pe', activity_level: 'high' },
  { label: 'Snack', start: '10:00', end: '10:15', event_type: 'snack', activity_level: 'low' },
  { label: 'ELA Block', start: '10:15', end: '12:00', event_type: null, activity_level: null },
  { label: 'Recess', start: '12:00', end: '12:25', event_type: 'recess', activity_level: 'medium' },
  { label: 'Lunch', start: '12:25', end: '12:50', event_type: 'lunch', activity_level: null },
]

const AFTERNOON_MON_WED: DayBlock[] = [
  { label: 'Social Studies / Science', start: '12:50', end: '13:50', event_type: null, activity_level: null },
  { label: 'Writing Revolution', start: '13:50', end: '14:20', event_type: null, activity_level: null },
]

const AFTERNOON_THU_FRI: DayBlock[] = [
  { label: 'Math', start: '12:50', end: '13:50', event_type: null, activity_level: null },
  { label: 'Math Intervention', start: '13:50', end: '14:20', event_type: null, activity_level: null },
]

// day_of_week: 0=Sun … 6=Sat
export function blocksForDay(dayOfWeek: number): DayBlock[] {
  if (dayOfWeek < 1 || dayOfWeek > 5) return [] // weekend
  const afternoon = dayOfWeek <= 3 ? AFTERNOON_MON_WED : AFTERNOON_THU_FRI
  return [...MORNING, ...afternoon]
}

// Dosing-relevant events for a day, shaped like DB rows so existing dosing/insight
// logic can consume them unchanged. Academic blocks (event_type null) are excluded.
export function dosingRowsForDay(dayOfWeek: number): T1dSchoolSchedule[] {
  return blocksForDay(dayOfWeek)
    .filter(b => b.event_type != null)
    .map((b, i) => ({
      id: `code-${dayOfWeek}-${i}`,
      day_of_week: dayOfWeek,
      start_time: `${b.start}:00`,
      end_time: `${b.end}:00`,
      event_type: b.event_type as NonNullable<DayBlock['event_type']>,
      activity_level: b.activity_level,
      notes: null,
      active: true,
      created_at: '',
    }))
}

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function getCurrentAndNext(): { current: DayBlock | null; next: DayBlock | null } {
  const { dayOfWeek, minutesSinceMidnight } = getCentralTime()
  const blocks = blocksForDay(dayOfWeek)
  const current = blocks.find(b => toMin(b.start) <= minutesSinceMidnight && toMin(b.end) > minutesSinceMidnight) ?? null
  const next = blocks.find(b => toMin(b.start) > minutesSinceMidnight) ?? null
  return { current, next }
}

export function minutesUntil(t: string): number {
  const { minutesSinceMidnight } = getCentralTime()
  return Math.max(0, toMin(t) - minutesSinceMidnight)
}

export function formatBlockTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return new Date(0, 0, 0, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
