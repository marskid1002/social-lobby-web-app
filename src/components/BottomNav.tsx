'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Home, Sparkles, Bell, User, Plus } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { PostRequestSheet } from './PostRequestSheet';
import { useAppState } from '@/lib/state';
import { totalUnreadMessages } from '@/lib/chat-unread';

const NAV_ITEMS = [
  { href: '/lobby/explore', icon: Home,        label: '首頁' },
  { href: '/plaza',         icon: Sparkles,    label: '廣場' },
  null, // FAB
  { href: '/inbox',         icon: Bell,        label: '通知' },
  { href: '/me',            icon: User,        label: '我的' },
];

export function BottomNav() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { state, currentUser, unreadCount } = useAppState();
  const isEscort = currentUser?.role === 'escort';
  const isGuest = currentUser?.tier === 'guest'; // 訪客唯讀：不顯示發局，避免按了假成功（伺服器會 403）
  const hideFab = isEscort || isGuest;
  const chatUnreadCount = totalUnreadMessages(
    state.chatMessages,
    state.chatReads,
    state.currentUserId,
  );
  const inboxBadgeCount = unreadCount + chatUnreadCount + (state.inboxUnread ? 1 : 0);

  function isActive(href: string) {
    if (href === '/lobby/explore') return pathname.startsWith('/lobby');
    if (href === '/inbox') return pathname === '/inbox';
    return pathname.startsWith(href);
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[430px] bg-white/95 backdrop-blur-xl border-t border-brand-lavender pb-safe shadow-[0_-14px_40px_rgba(0,0,0,.32)]"
        aria-label="主選單"
      >
        <div className="flex items-end justify-around px-2 pt-2 pb-1">
          {NAV_ITEMS.map((item, i) => {
            if (!item) {
              if (hideFab) {
                return <div key="fab" className="w-14" />;
              }
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
            const showNotifBadge = item.href === '/inbox' && inboxBadgeCount > 0;
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
                  {showNotifBadge && (
                    <span className="absolute -top-2.5 -right-3 min-w-4 h-4 rounded-full bg-red-500 border border-brand-lavender px-1 text-[9px] font-bold leading-[14px] text-center text-white">
                      {inboxBadgeCount > 99 ? '99+' : inboxBadgeCount}
                    </span>
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
    </>,
    document.body,
  );
}
