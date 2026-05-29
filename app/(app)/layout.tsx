import { BottomNav } from '@/components/t1d/bottom-nav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto">
      <div className="flex-1 overflow-y-auto pb-14">{children}</div>
      <BottomNav />
    </div>
  )
}
