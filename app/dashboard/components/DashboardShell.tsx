import { Sidebar } from './Sidebar';
import type { Store } from '@/lib/onboarding/state';

type Props = {
  store: Store;
  currentSection: string;
  children: React.ReactNode;
};

export function DashboardShell({ store, currentSection, children }: Props) {
  return (
    <div className="min-h-dvh bg-[#16222E] flex">
      {/* Background grid */}
      <div
        aria-hidden
        className="fixed inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #F5C84B 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Sidebar — desktop: fixed left */}
      <Sidebar store={store} currentSection={currentSection} />

      {/* Main content */}
      <main className="flex-1 lg:ml-60 min-w-0">
        <div className="max-w-2xl mx-auto px-4 py-8 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
