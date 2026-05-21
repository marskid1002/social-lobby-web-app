'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: '關注', href: '/lobby/following' },
  { label: '探索', href: '/lobby/explore' },
  { label: '附近', href: '/lobby/nearby' },
];

export default function LobbyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col">
      {/* Sticky tabs */}
      <div className="sticky top-[57px] z-30 bg-white border-b border-brand-lavender">
        <div className="flex">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex-1 text-center py-3 text-sm font-semibold transition-colors ${
                  active
                    ? 'text-brand-ink border-b-2 border-brand-sky'
                    : 'text-zinc-400 border-b-2 border-transparent'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {children}
    </div>
  );
}
