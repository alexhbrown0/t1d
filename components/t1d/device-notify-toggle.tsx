'use client'

import { useEffect, useState } from 'react'
import { isParentDevice, setParentDevice } from '@/lib/t1d/device'

export function DeviceNotifyToggle() {
  const [parent, setParent] = useState(false)
  const [tested, setTested] = useState(false)

  useEffect(() => { setParent(isParentDevice()) }, [])

  const toggle = () => {
    const next = !parent
    setParentDevice(next)
    setParent(next)
  }

  const sendTest = async () => {
    await fetch('/api/t1d/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'correction', summary: 'Test notification', detail: 'This is what a nurse-logged event looks like', logged_by: 'nurse' }),
    })
    setTested(true)
    setTimeout(() => setTested(false), 4000)
  }

  return (
    <div className="bg-[#141414] rounded-2xl border border-white/5 p-4 space-y-3">
      <button onClick={toggle}
        className={`w-full rounded-xl border px-4 py-3.5 flex items-center justify-between text-left transition-colors ${
          parent ? 'bg-teal-500/10 border-teal-500/30' : 'bg-black/20 border-white/5'
        }`}>
        <div className="flex-1 min-w-0 pr-3">
          <p className={`text-sm font-semibold ${parent ? 'text-teal-300' : 'text-gray-300'}`}>Notify me on this device</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Turn on for your own device. You&apos;ll get a toast when someone else — like the school nurse — logs a dose, correction, low, or meal. Leave it off on her device.</p>
        </div>
        <div className={`w-11 h-6 rounded-full flex-shrink-0 relative transition-colors ${parent ? 'bg-teal-500' : 'bg-white/10'}`}>
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${parent ? 'left-6' : 'left-1'}`} />
        </div>
      </button>

      {parent && (
        <button onClick={sendTest} className="w-full bg-white/5 border border-white/10 text-gray-300 text-sm font-semibold py-3 rounded-xl">
          {tested ? 'Sent — watch for the toast (≤20s) ✓' : 'Send a test notification'}
        </button>
      )}
    </div>
  )
}
