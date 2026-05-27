export function AppHeader() {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="font-playfair text-2xl italic text-white leading-none">Brooks.</h1>
        <p className="text-[10px] tracking-widest text-gray-500 mt-0.5 font-medium">HIGHS &amp; LOWS</p>
      </div>
      <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
        <div className="w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center text-[9px] font-bold text-black">A</div>
        <span className="text-xs text-gray-400">mom</span>
      </div>
    </div>
  )
}
