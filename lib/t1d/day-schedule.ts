import { getCentralTime } from '@/lib/utils/central-time'
import type { T1dSchoolSchedule } from '@/types/health'

export interface DayBlock {
  label: string
  start: string // "HH:MM"
  end: string   // "HH:MM"
  event_type: 'pe' | 'snack' | 'recess' | 'lunch' | null // dosing-relevant; null = plain academic block
  activity_level: 'high' | 'medium' | 'low' | null
}

// Brooks's 1st-grade daily timetable (new school — Mrs. Hagan, 2025-2026) — THE
// source of truth for schedule everywhere (the "where is he now" card, the
// Schedule page, and the dosing engine). Same every weekday.
// Edit here when the school schedule changes — no DB migration needed.
const DAY: DayBlock[] = [
  { label: 'Breakfast / Morning Work', start: '07:05', end: '07:45', event_type: null, activity_level: null },
  { label: 'Reading', start: '07:45', end: '08:45', event_type: null, activity_level: null },
  { label: 'Tier 2 Reading', start: '08:45', end: '09:15', event_type: null, activity_level: null },
  { label: 'Reading Groups', start: '09:15', end: '09:45', event_type: null, activity_level: null },
  { label: 'Grammar', start: '09:45', end: '10:15', event_type: null, activity_level: null },
  { label: 'Lunch', start: '10:15', end: '10:35', event_type: 'lunch', activity_level: null },
  { label: 'Writing', start: '10:35', end: '10:55', event_type: null, activity_level: null },
  { label: 'Tier 2 Math', start: '10:55', end: '11:25', event_type: null, activity_level: null },
  { label: 'Math Groups', start: '11:25', end: '11:55', event_type: null, activity_level: null },
  { label: 'Math', start: '11:55', end: '12:55', event_type: null, activity_level: null },
  { label: 'PE', start: '12:55', end: '13:40', event_type: 'pe', activity_level: 'high' },
  { label: 'Science / Social Studies', start: '13:40', end: '14:10', event_type: null, activity_level: null },
  { label: 'Pack Up', start: '14:10', end: '14:20', event_type: null, activity_level: null },
  { label: 'Snack', start: '14:20', end: '14:32', event_type: 'snack', activity_level: 'low' },
  // After dismissal he waits in Amanda's office (Legos / quiet play) while she
  // finishes the car-rider line and drives him home — no activity to dose for.
  { label: "Amanda's Office", start: '14:32', end: '15:00', event_type: null, activity_level: null },
]

// day_of_week: 0=Sun … 6=Sat
export function blocksForDay(dayOfWeek: number): DayBlock[] {
  if (dayOfWeek < 1 || dayOfWeek > 5) return [] // weekend
  return DAY
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
