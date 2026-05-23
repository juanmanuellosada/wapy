import Link from 'next/link';

interface Props {
  currentTab: 'leads' | 'whitelist';
}

export function AdminNav({ currentTab }: Props) {
  const tabs = [
    { tab: 'leads' as const, href: '/admin/leads', label: 'Leads' },
    { tab: 'whitelist' as const, href: '/admin/whitelist', label: 'Whitelist' },
  ];

  return (
    <nav className="flex gap-2" aria-label="Secciones de admin">
      {tabs.map(({ tab, href, label }) => {
        const isActive = currentTab === tab;
        return (
          <Link
            key={tab}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5C84B] ${
              isActive
                ? 'bg-[#F5C84B] text-[#16222E]'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
