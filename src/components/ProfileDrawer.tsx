'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, User, ClipboardList, ShieldOff, Settings, RotateCcw, LogOut, MapPin, ChevronRight } from 'lucide-react';
import { useAppState, resetState } from '@/lib/state';
import { TAIPEI_AREAS } from '@/lib/mock';
import type { OnlineStatus } from '@/lib/mock';
import { DemoUserSwitcher } from './DemoUserSwitcher';

const STATUS_OPTIONS: { value: OnlineStatus['status']; label: string; color: string }[] = [
  { value: 'available', label: '可接局', color: '#10B981' },
  { value: 'fill_spot', label: '可補位', color: '#F59E0B' },
  { value: 'bring_people', label: '可帶人', color: '#3B82F6' },
  { value: 'busy', label: '忙碌', color: '#6B7280' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ProfileDrawer({ open, onClose }: Props) {
  const { currentUser, isOnline, currentOnlineStatus, setOnline, setStatus, setArea, reset } = useAppState();
  const router = useRouter();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [resetToast, setResetToast] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleAvatarPress() {
    pressTimer.current = setTimeout(() => setSwitcherOpen(true), 600);
  }
  function handleAvatarRelease() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }

  function handleReset() {
    reset();
    setResetToast(true);
    setTimeout(() => setResetToast(false), 2000);
  }

  function handleLogout() {
    resetState();
    onClose();
    router.push('/login');
  }

  function navigate(path: string) {
    onClose();
    router.push(path);
  }

  const tierLabel = currentUser?.tier === 'vip' ? 'VIP' : currentUser?.tier === 'premium' ? '進階' : currentUser?.tier === 'standard' ? '標準' : 'Free';
  const tierColor = currentUser?.tier === 'vip' ? '#F59E0B' : currentUser?.tier === 'premium' ? '#7C3AED' : currentUser?.tier === 'standard' ? '#3B82F6' : '#6B7280';

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

        {/* Drawer panel */}
        <div
          className="relative w-[85%] max-w-[360px] h-full bg-gradient-ice rounded-r-[32px] flex flex-col overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-card-a p-5 pt-10">
            <div className="flex items-start justify-between mb-3">
              <button
                onMouseDown={handleAvatarPress}
                onMouseUp={handleAvatarRelease}
                onTouchStart={handleAvatarPress}
                onTouchEnd={handleAvatarRelease}
                onClick={() => navigate('/me')}
                className="active:scale-95 transition-transform"
                aria-label="我的個人檔案"
              >
                <img
                  src={currentUser?.avatarUrl}
                  alt={currentUser?.nickname}
                  className="w-14 h-14 rounded-full object-cover ring-4 ring-white shadow-card"
                />
              </button>
              <button onClick={onClose} className="p-1.5 rounded-full bg-white/60" aria-label="關閉">
                <X className="w-4 h-4 text-brand-ink" strokeWidth={1.75} />
              </button>
            </div>
            <p className="text-lg font-semibold text-brand-ink">{currentUser?.nickname}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-zinc-500">{currentUser?.id}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: tierColor + '20', color: tierColor }}>
                {tierLabel}
              </span>
              <span className="text-xs text-zinc-500">{currentUser?.credits} 點</span>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {/* Status controls */}
            <div className="bg-white rounded-2xl p-4 shadow-card flex flex-col gap-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">目前狀態</p>

              {/* Status select */}
              <div className="relative">
                <select
                  value={currentOnlineStatus?.status ?? 'available'}
                  onChange={(e) => setStatus(e.target.value as OnlineStatus['status'])}
                  className="w-full rounded-xl border border-brand-lavender bg-brand-snow px-4 py-2.5 text-sm text-brand-ink focus:outline-none appearance-none"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Area select */}
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-zinc-400 shrink-0" strokeWidth={1.75} />
                <select
                  value={currentUser?.defaultArea ?? '信義區'}
                  onChange={(e) => setArea(e.target.value)}
                  className="flex-1 rounded-xl border border-brand-lavender bg-brand-snow px-3 py-2.5 text-sm text-brand-ink focus:outline-none appearance-none"
                >
                  {TAIPEI_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              {/* Online toggle */}
              <button
                onClick={() => setOnline(!isOnline)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${
                  isOnline ? 'bg-status-available/10 border-2 border-status-available/30' : 'bg-brand-snow border-2 border-brand-lavender'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-status-available' : 'bg-zinc-300'}`} />
                  <span className={`text-sm font-semibold ${isOnline ? 'text-status-available' : 'text-zinc-400'}`}>
                    {isOnline ? '我已上線' : '我離線中'}
                  </span>
                </div>
                <div className={`w-11 h-6 rounded-full transition-colors ${isOnline ? 'bg-status-available' : 'bg-zinc-200'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-sm mt-0.5 transition-transform ${isOnline ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
                </div>
              </button>
            </div>

            {/* Nav links */}
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              {[
                { icon: User, label: '我的個人檔案', path: '/me' },
                { icon: ClipboardList, label: '我的需求', path: '/inbox' },
                { icon: ShieldOff, label: '封鎖名單', path: '/settings' },
                { icon: Settings, label: '設定', path: '/settings' },
              ].map((item, i) => (
                <button
                  key={item.path + item.label}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-brand-ice transition-colors ${i > 0 ? 'border-t border-brand-lavender' : ''}`}
                >
                  <item.icon className="w-4.5 h-4.5 text-zinc-400" strokeWidth={1.75} />
                  <span className="flex-1 text-sm font-medium text-brand-ink">{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-zinc-300" strokeWidth={1.75} />
                </button>
              ))}
            </div>

            {/* Dev actions */}
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              <button
                onClick={handleReset}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-brand-ice transition-colors"
              >
                <RotateCcw className="w-4.5 h-4.5 text-zinc-400" strokeWidth={1.75} />
                <span className="text-sm font-medium text-zinc-500">重置示範資料</span>
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left border-t border-brand-lavender hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4.5 h-4.5 text-red-400" strokeWidth={1.75} />
                <span className="text-sm font-medium text-red-500">登出</span>
              </button>
            </div>

            {/* Demo switcher shortcut */}
            <button
              onClick={() => setSwitcherOpen(true)}
              className="w-full text-center text-xs text-zinc-400 py-2 rounded-xl bg-white/60 border border-brand-lavender"
            >
              🔄 切換示範用戶
            </button>

            <p className="text-center text-xs text-zinc-300 pb-2">v0.1 · zh-Hant</p>
          </div>
        </div>
      </div>

      {resetToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-brand-ink text-white text-sm rounded-full px-5 py-2.5 shadow-lg z-[200]">
          示範資料已重置
        </div>
      )}

      <DemoUserSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </>
  );
}
