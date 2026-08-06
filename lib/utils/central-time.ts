/**
 * All time-of-day and date logic for this app uses America/Chicago (Central Time).
 * The Vercel server runs in UTC, so never use getHours(), getDay(), getDate(),
 * setHours(), or toISOString().split('T')[0] — they all return UTC values.
 * Use these helpers instead.
 */

const TIMEZONE = 'America/Chicago'
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export interface CentralTime {
  year: number
  month: number               // 1-12
  day: number
  hour: number                // 0-23
  minute: number
  dayOfWeek: number           // 0=Sun, 6=Sat
  dateStr: string             // YYYY-MM-DD in Central
  timeStr: string             // HH:MM in Central (24h)
  minutesSinceMidnight: number
}

export function getCentralTime(date = new Date()): CentralTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
    }).formatToParts(date).map(({ type, value }) => [type, value])
  )
  const year = parseInt(parts.year)
  const month = parseInt(parts.month)
  const day = parseInt(parts.day)
  const hour = parseInt(parts.hour === '24' ? '0' : parts.hour)
  const minute = parseInt(parts.minute)
  const dayOfWeek = WEEKDAYS.indexOf(parts.weekday)
  return {
    year, month, day, hour, minute,
    dayOfWeek: dayOfWeek === -1 ? 0 : dayOfWeek,
    dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    minutesSinceMidnight: hour * 60 + minute,
  }
}

/**
 * UTC Date for midnight of the Central calendar day, offset by days.
 * Use for Supabase gte/lt range queries that should align with the Central day.
 */
export function getCentralDayStartUTC(offsetDays = 0, date = new Date()): Date {
  const ct = getCentralTime(date)
  return new Date(Date.UTC(ct.year, ct.month - 1, ct.day + offsetDays))
}

/**
 * UTC Date for the start (Sunday midnight) of the current Central week.
 * Used to decide whether the weekly snack set has been packed this week.
 */
export function getCentralWeekStartUTC(date = new Date()): Date {
  const ct = getCentralTime(date)
  return getCentralDayStartUTC(-ct.dayOfWeek, date)
}

/**
 * YYYY-MM-DD string in Central Time, offset by days.
 * Replaces the anti-pattern: new Date().toISOString().split('T')[0]
 */
export function getCentralDateStr(offsetDays = 0, date = new Date()): string {
  if (offsetDays === 0) return getCentralTime(date).dateStr
  const ct = getCentralTime(date)
  const d = new Date(Date.UTC(ct.year, ct.month - 1, ct.day + offsetDays))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * Formatted time string in Central Time for display or LLM context.
 */
export function getCentralTimeDisplay(date = new Date()): string {
  return date.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}
