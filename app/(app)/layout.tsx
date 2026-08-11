import { BottomNav } from '@/components/t1d/bottom-nav'
import { EventNotifier } from '@/components/t1d/event-notifier'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col w-full max-w-lg mx-auto overflow-x-hidden" style={{ height: '100dvh' }}>
      <EventNotifier />
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 56px)' }}>{children}</div>
      <BottomNav />
    </div>
  )
}
