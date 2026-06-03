import Link from 'next/link'

export function EngineLunchEntry() {
  return (
    <div className="space-y-3">
      <div className="bg-[#141414] rounded-2xl border border-white/5 p-5 text-center space-y-3">
        <div className="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center mx-auto">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l19-9-9 19-2-8-8-2z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Pack Lunch</p>
          <p className="text-xs text-gray-500 mt-1">Take a photo or build manually</p>
        </div>
        <Link
          href="/engine/lunch"
          className="block w-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm font-semibold py-3 rounded-xl text-center"
        >
          Start Lunch Setup
        </Link>
      </div>
    </div>
  )
}
