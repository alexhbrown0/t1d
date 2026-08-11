'use client'

const PARENT_KEY = 't1d_parent_device'

export function isParentDevice(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(PARENT_KEY) === '1'
}

export function setParentDevice(on: boolean): void {
  if (typeof window === 'undefined') return
  if (on) window.localStorage.setItem(PARENT_KEY, '1')
  else window.localStorage.removeItem(PARENT_KEY)
}

export type EventKind = 'low' | 'dose' | 'correction' | 'meal'

/**
 * Emit an activity event for the multi-user notification stream. Fire-and-forget:
 * a failure here must never break the primary action. logged_by is derived from
 * whether this device is flagged as the parent's.
 */
export async function logEvent(kind: EventKind, summary: string, detail?: string): Promise<void> {
  try {
    await fetch('/api/t1d/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, summary, detail: detail ?? null, logged_by: isParentDevice() ? 'parent' : 'nurse' }),
    })
  } catch {
    /* ignore — notification is best-effort */
  }
}
