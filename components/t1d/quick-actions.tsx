'use client'

import Link from 'next/link'

const actions = [
  { label: 'Log a Low', href: '/log/low', color: 'bg-red-900 text-red-200 border-red-800' },
  { label: 'Log a Meal', href: '/log/meal', color: 'bg-blue-900 text-blue-200 border-blue-800' },
  { label: 'Confirm Dose', href: '/log/dose', color: 'bg-green-900 text-green-200 border-green-800' },
]

export function QuickActions() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className={`rounded-xl border px-3 py-4 text-center text-sm font-medium ${a.color}`}
        >
          {a.label}
        </Link>
      ))}
    </div>
  )
}
