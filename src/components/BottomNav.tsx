'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Home, Sparkles, Inbox, Bell, Plus } from 'lucide-react';
import { useState } from 'react';
import { PostRequestSheet } from './PostRequestSheet';
import { useAppState } from '@/lib/state';

const NAV_ITEMS = [
  { href: '/lobby/explore', icon: Home, label: '首頁' },
  { href: '/plaza', icon: Sparkles, label: '廣場' },
  null, // FAB
  { href: '/inbox', icon: Inbox, label: '收件匣' },
  { href: '/updates', icon: Bell, label: '動態' },
];

export function BottomNav() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { state, unreadCount } = useAppState();

  function isActive(href: string) {
    if (href === '/lobby/explore') return pathname.startsWith('/lobby');
    return pathname.startsWith(href);
  }

  return (
    <>
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-brand-lavender pb-safe z-30">
        <div className="flex items-end justify-around px-2 pt-2 pb-1">
          {NAV_ITEMS.map((item, i) => {
            if (!item) {
              return (
                <div key="fab" className="flex flex-col items-center -mt-5">
                  <button
                    onClick={() => setSheetOpen(true)}
                    className="w-14 h-14 rounded-full bg-gradient-sky-pink flex items-center justify-center shadow-fab active:scale-95 transition-transform"
                    aria-label="發布需求"
                  >
                    <Plus className="w-7 h-7 text-white" strokeWidth={2.5} />
                  </button>
                  <span className="text-[10px] text-zinc-400 mt-1">發布</span>
                </div>
              );
            }
            const active = isActive(item.href);
            const showInboxBadge = item.href === '/inbox' && state.inboxUnread;
            const showUpdatesBadge = item.href === '/updates' && unreadCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl active:bg-brand-ice transition-colors"
                aria-label={item.label}
              >
                <div className="relative">
                  <item.icon
                    className={`w-5 h-5 ${active ? 'text-brand-sky' : 'text-zinc-400'}`}
                    strokeWidth={active ? 2 : 1.75}
                  />
                  {(showInboxBadge || showUpdatesBadge) && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 border border-white" />
                  )}
                </div>
                <span className={`text-[10px] ${active ? 'font-semibold text-brand-sky' : 'text-zinc-400'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <PostRequestSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
