'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { isParentDevice, setParentDevice } from '@/lib/t1d/device'

export default function SettingsPage() {
  const [parent, setParent] = useState(false)
  const [tested, setTested] = useState(false)

  useEffect(() => { setParent(isParentDevice()) }, [])

  const toggle = () => {
    const next = !parent
    setParentDevice(next)
    setParent(next)
  }

  const sendTest = async () => {
    // Emitted as 'nurse' so it will actually toast on this (parent) device.
    await fetch('/api/t1d/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'low', summary: 'Test notification', detail: 'This is what a nurse-logged event looks like', logged_by: 'nurse' }),
    })
    setTested(true)
    setTimeout(() => setTested(false), 3000)
  }

  return (
    <div className="px-4 pt-5 pb-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/now" className="text-gray-500 flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div>
          <p className="text-[10px] tracking-widest text-gray-500 font-semibold">SETTINGS</p>
          <p className="text-lg font-semibold text-white">This Device</p>
        </div>
      </div>

      <div className="bg-[#141414] rounded-2xl border border-white/5 p-4 space-y-3">
        <button onClick={toggle}
          className={`w-full rounded-xl border px-4 py-3.5 flex items-center justify-between text-left transition-colors ${
            parent ? 'bg-teal-500/10 border-teal-500/30' : 'bg-black/20 border-white/5'
          }`}>
          <div className="flex-1 min-w-0 pr-3">
            <p className={`text-sm font-semibold ${parent ? 'text-teal-300' : 'text-gray-300'}`}>Notify me on this device</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Turn this on for your own device (desktop). You&apos;ll get a toast when someone else — like the school nurse — logs a dose, correction, low, or meal. Their device stays silent.</p>
          </div>
          <div className={`w-11 h-6 rounded-full flex-shrink-0 relative transition-colors ${parent ? 'bg-teal-500' : 'bg-white/10'}`}>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${parent ? 'left-6' : 'left-1'}`} />
          </div>
        </button>

        {parent && (
          <button onClick={sendTest} className="w-full bg-white/5 border border-white/10 text-gray-300 text-sm font-semibold py-3 rounded-xl">
            {tested ? 'Sent — watch for the toast ✓' : 'Send a test notification'}
          </button>
        )}
      </div>

      <p className="text-[11px] text-gray-600 px-1">
        Leave this off on the school nurse&apos;s device (and any device you don&apos;t want alerts on). Only devices with this on will show notifications.
      </p>
    </div>
  )
}
