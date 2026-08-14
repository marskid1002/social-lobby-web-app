'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Bell, ShieldCheck } from 'lucide-react';
import { useAppState } from '@/lib/state';
import { DemoUserSwitcher } from './DemoUserSwitcher';

interface Props {
  title?: string;
  showSearch?: boolean;
  onSearchChange?: (v: string) => void;
  onOpenDrawer: () => void;
  inboxUnreadCount: number;
}

export function TopBar({ title, showSearch, onSearchChange, onOpenDrawer, inboxUnreadCount }: Props) {
  const { currentUser } = useAppState();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleAvatarPress() {
    pressTimer.current = setTimeout(() => setSwitcherOpen(true), 600);
  }
  function handleAvatarRelease() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }

  function handleSearch(v: string) {
    setSearchVal(v);
    onSearchChange?.(v);
  }

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-brand-lavender px-4 py-2.5 flex items-center gap-3 shadow-[0_10px_30px_rgba(0,0,0,.16)]">
        {/* Avatar */}
        <button
          onClick={onOpenDrawer}
          onMouseDown={handleAvatarPress}
          onMouseUp={handleAvatarRelease}
          onTouchStart={handleAvatarPress}
          onTouchEnd={handleAvatarRelease}
          className="shrink-0 rounded-full ring-2 ring-brand-sky/60 shadow-[0_0_18px_rgba(255,60,145,.18)] active:scale-95 transition-transform"
          aria-label="開啟選單"
        >
          <img
            src={currentUser?.avatarUrl}
            alt={currentUser?.nickname}
            className="w-9 h-9 rounded-full object-cover"
          />
        </button>

        {/* Middle */}
        <div className="flex-1 min-w-0">
          {showSearch ? (
            <div className="flex items-center gap-2 bg-brand-ice rounded-full px-3 py-2 border border-brand-lavender">
              <svg className="w-4 h-4 text-zinc-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input
                value={searchVal}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="搜尋用戶..."
                className="flex-1 bg-transparent text-sm text-brand-ink placeholder:text-zinc-400 focus:outline-none"
                aria-label="搜尋用戶"
              />
            </div>
          ) : (
            <h1 className="text-base font-semibold text-brand-ink truncate">{title}</h1>
          )}
        </div>

        {/* Bell */}
        {currentUser?.role === 'admin' && (
          <Link
            href="/admin"
            className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-sky-pink px-3 py-2 text-[11px] font-bold text-white shadow-fab"
            aria-label="返回管理後台"
          >
            <ShieldCheck className="h-4 w-4" strokeWidth={2} />
            後台
          </Link>
        )}
        <Link href="/inbox" className="relative shrink-0 p-1.5 rounded-full hover:bg-brand-ice transition-colors" aria-label="通知">
          <Bell className="w-5 h-5 text-brand-ink" strokeWidth={1.75} />
          {inboxUnreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full bg-red-500 border border-white px-1 text-[9px] font-bold leading-[14px] text-center text-white">
              {inboxUnreadCount > 99 ? '99+' : inboxUnreadCount}
            </span>
          )}
        </Link>
      </header>

      <DemoUserSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </>
  );
}
