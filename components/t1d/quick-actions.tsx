import Link from 'next/link'

const actions = [
  {
    href: '/log/bolus',
    label: 'Bolus',
    sub: 'food',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 2l1.5 1.5M6 2l1.5 1.5M3 5l1.5 1.5M9 3c0 1.5-1 2.5-2 3.5L4.5 9A2.5 2.5 0 007 11.5l2.5-2.5C10.5 8 11.5 7 13 7" />
        <path d="M13 7l4 4-6 6-4-4 4-4" />
        <path d="M16 11l4.5 4.5a2 2 0 01-3 3L13 14" />
      </svg>
    ),
  },
  {
    href: '/log/low',
    label: 'Low',
    sub: 'fast carbs',
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <polyline points="19 12 12 19 5 12" />
      </svg>
    ),
  },
  {
    href: '/log/correction',
    label: 'Correction',
    sub: 'bring down',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/20',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    href: '/log/activity',
    label: 'Activity',
    sub: 'log movement',
    color: 'text-green-400',
    bg: 'bg-green-500/10 border-green-500/20',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="1" fill="currentColor" />
        <path d="M9 20l3-8 3 8M6 13l3-3 3 1 3-3" />
      </svg>
    ),
  },
]

export function QuickActions() {
  return (
    <div className="grid grid-cols-4 gap-2">
      {actions.map((a) => (
        <Link key={a.href} href={a.href}>
          <div className={`rounded-xl border px-2 py-3 flex flex-col items-center gap-2 ${a.bg} ${a.color}`}>
            {a.icon}
            <div className="text-center">
              <p className="text-[11px] font-semibold text-white leading-none">{a.label}</p>
              <p className="text-[9px] text-gray-500 mt-0.5 leading-none">{a.sub}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
