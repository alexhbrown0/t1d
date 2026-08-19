'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { logEvent } from '@/lib/t1d/device'

// Marks "he's eating in the lunchroom today" — creates an empty cafeteria meal
// (the equivalent of packed). The nurse picks the plate + doses at /lunch.
export function LunchroomStartButton({ className }: { className?: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const start = async () => {
    setLoading(true)
    try {
      await fetch('/api/t1d/meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: 'school_lunch',
          is_cafeteria: true,
          items: [],
          source: 'cafeteria',
          entered_by: 'alexandra',
        }),
      })
      await logEvent('meal', 'Eating in lunchroom today')
      router.push('/lunch')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button onClick={start} disabled={loading} className={className}>
      {loading ? 'Starting…' : 'Eating in lunchroom'}
    </button>
  )
}
