import { getCentralTime, getCentralDayStartUTC } from '@/lib/utils/central-time'

export function getLunchTargetDate() {
  const ct = getCentralTime()
  const packingForTomorrow = ct.hour >= 13
  const dayOffset = packingForTomorrow ? 1 : 0

  const targetDate = getCentralDayStartUTC(dayOffset)
  const targetEnd  = getCentralDayStartUTC(dayOffset + 1)

  // Noon UTC on target day = morning Central in both CDT and CST
  const saveTimestamp = new Date(Date.UTC(ct.year, ct.month - 1, ct.day + dayOffset, 12, 0, 0))

  const targetLabel = targetDate.toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short', month: 'short', day: 'numeric',
  })

  return { packingForTomorrow, targetDate, targetEnd, saveTimestamp, targetLabel }
}
