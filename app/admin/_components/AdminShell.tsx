import { AdminNav } from './AdminNav';

interface Props {
  email: string;
  currentTab: 'leads' | 'whitelist';
  children: React.ReactNode;
}

export function AdminShell({ email, currentTab, children }: Props) {
  return (
    <div className="min-h-dvh bg-[#16222E]">
      {/* Dot grid background */}
      <div
        aria-hidden
        className="fixed inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #F5C84B 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 flex flex-col min-h-dvh">
        {/* Header */}
        <header className="border-b border-white/10 bg-[#16222E]/95 backdrop-blur-sm sticky top-0 z-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="font-display text-2xl text-white leading-none">Wapy</span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-[#F5C84B]/20 text-[#F5C84B] border border-[#F5C84B]/30 uppercase">
                  Admin
                </span>
              </div>
              <AdminNav currentTab={currentTab} />
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
              <span className="hidden sm:block text-xs text-white/50 truncate max-w-[200px]">
                {email}
              </span>
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  className="min-h-[36px] px-4 py-1.5 rounded-lg border border-white/20 text-white/80 text-xs font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5C84B] transition-colors duration-150 cursor-pointer"
                >
                  Cerrar sesión
                </button>
              </form>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
