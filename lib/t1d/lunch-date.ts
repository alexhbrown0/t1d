const TIMEZONE = 'America/Chicago'

export function getLunchTargetDate() {
  const now = new Date()

  // Get current time parts in Central timezone
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
    }).formatToParts(now).map(({ type, value }) => [type, value])
  )

  const centralHour = parseInt(parts.hour)
  const cy = parseInt(parts.year)
  const cm = parseInt(parts.month)
  const cd = parseInt(parts.day)

  const packingForTomorrow = centralHour >= 13
  const dayOffset = packingForTomorrow ? 1 : 0

  // Build UTC range for the target Central day.
  // Using Date.UTC with Central date parts avoids UTC-vs-local ambiguity.
  const targetDate = new Date(Date.UTC(cy, cm - 1, cd + dayOffset))
  const targetEnd  = new Date(Date.UTC(cy, cm - 1, cd + dayOffset + 1))

  // Save timestamp: noon UTC on target day (= 7 AM CDT or 6 AM CST — always morning Central)
  const saveTimestamp = new Date(Date.UTC(cy, cm - 1, cd + dayOffset, 12, 0, 0))

  // Human-readable label for the target date
  const targetLabel = targetDate.toLocaleDateString('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short', month: 'short', day: 'numeric',
  })

  return { packingForTomorrow, targetDate, targetEnd, saveTimestamp, targetLabel }
}
