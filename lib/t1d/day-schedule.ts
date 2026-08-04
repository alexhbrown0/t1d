import { getCentralTime } from '@/lib/utils/central-time'

export interface DayBlock {
  label: string
  start: string // "HH:MM"
  end: string   // "HH:MM"
}

// Brooks's 1st-grade weekly timetable (source of truth for the "where is he now" snapshot).
// Edit here when the school schedule changes — no DB migration needed.
const MORNING: DayBlock[] = [
  { label: 'Homeroom', start: '07:40', end: '07:55' },
  { label: 'Math', start: '07:55', end: '09:00' },
  { label: 'PE / Specials', start: '09:00', end: '10:00' },
  { label: 'Snack', start: '10:00', end: '10:15' },
  { label: 'ELA Block', start: '10:15', end: '12:00' },
  { label: 'Recess', start: '12:00', end: '12:25' },
  { label: 'Lunch', start: '12:25', end: '12:50' },
]

const AFTERNOON_MON_WED: DayBlock[] = [
  { label: 'Social Studies / Science', start: '12:50', end: '13:50' },
  { label: 'Writing Revolution', start: '13:50', end: '14:20' },
]

const AFTERNOON_THU_FRI: DayBlock[] = [
  { label: 'Math', start: '12:50', end: '13:50' },
  { label: 'Math Intervention', start: '13:50', end: '14:20' },
]

// day_of_week: 0=Sun … 6=Sat
export function blocksForDay(dayOfWeek: number): DayBlock[] {
  if (dayOfWeek < 1 || dayOfWeek > 5) return [] // weekend
  const afternoon = dayOfWeek <= 3 ? AFTERNOON_MON_WED : AFTERNOON_THU_FRI
  return [...MORNING, ...afternoon]
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
