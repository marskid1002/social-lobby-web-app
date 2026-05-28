'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useAppState } from '@/lib/state';
import { DemoUserSwitcher } from './DemoUserSwitcher';

interface Props {
  title?: string;
  showSearch?: boolean;
  onSearchChange?: (v: string) => void;
  onOpenDrawer: () => void;
}

export function TopBar({ title, showSearch, onSearchChange, onOpenDrawer }: Props) {
  const { currentUser, unreadCount } = useAppState();
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
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-brand-lavender px-4 py-2.5 flex items-center gap-3">
        {/* Avatar */}
        <button
          onClick={onOpenDrawer}
          onMouseDown={handleAvatarPress}
          onMouseUp={handleAvatarRelease}
          onTouchStart={handleAvatarPress}
          onTouchEnd={handleAvatarRelease}
          className="shrink-0 rounded-full ring-2 ring-brand-sky/50 active:scale-95 transition-transform"
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
            <div className="flex items-center gap-2 bg-brand-snow rounded-full px-3 py-2 border border-brand-lavender">
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
        <Link href="/inbox" className="relative shrink-0 p-1.5 rounded-full hover:bg-brand-ice transition-colors" aria-label="通知">
          <Bell className="w-5 h-5 text-brand-ink" strokeWidth={1.75} />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-brand-pink rounded-full flex items-center justify-center text-[9px] font-bold text-brand-ink">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
      </header>

      <DemoUserSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </>
  );
}
