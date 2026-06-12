'use client';

import { useAppState } from '@/lib/state';

/**
 * 浮動的第二身份徽章 — 顯示在右下角（BottomNav 上方）。
 * 點擊後互換主副身份，方便 demo 雙視角流程。
 */
export function DualIdentityBadge() {
  const { state, swapIdentities, secondaryUnreadCount } = useAppState();

  if (!state.secondaryUserId) return null;

  const secondaryUser = state.users.find((u) => u.id === state.secondaryUserId);
  if (!secondaryUser) return null;

  const primaryUser = state.users.find((u) => u.id === state.currentUserId);

  return (
    <button
      onClick={swapIdentities}
      aria-label={`切換到 ${secondaryUser.nickname}`}
      className="fixed bottom-[5.5rem] right-4 z-50 flex items-center gap-2 bg-white rounded-full shadow-xl border-2 border-brand-sky pl-1 pr-3 py-1 active:scale-95 transition-transform"
    >
      {/* 第二身份頭像 */}
      <div className="relative shrink-0">
        <img
          src={secondaryUser.avatarUrl}
          alt={secondaryUser.nickname}
          className="w-9 h-9 rounded-full object-cover"
        />
        {secondaryUnreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-brand-pink rounded-full flex items-center justify-center text-[9px] font-bold text-brand-ink">
            {secondaryUnreadCount > 9 ? '9+' : secondaryUnreadCount}
          </span>
        )}
      </div>

      <div className="text-left leading-tight">
        <p className="text-[10px] font-bold text-brand-sky">第二身份</p>
        <p className="text-xs font-semibold text-brand-ink truncate max-w-[80px]">
          {secondaryUser.nickname}
        </p>
      </div>

      {/* 互換箭頭 */}
      <svg className="w-3.5 h-3.5 text-zinc-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      {/* 目前身份小圖 */}
      {primaryUser && (
        <img
          src={primaryUser.avatarUrl}
          alt={primaryUser.nickname}
          className="w-6 h-6 rounded-full object-cover border-2 border-zinc-200 -ml-1 shrink-0"
        />
      )}
    </button>
  );
}
