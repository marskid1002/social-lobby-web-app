'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { resetState } from '@/lib/state';
import { users } from '@/lib/mock';

function LineIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.135-.033.194-.033.21 0 .39.09.515.255l2.444 3.319v-2.94c0-.345.282-.63.633-.63.345 0 .626.285.626.63v4.765zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629zM24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}

// 客戶（VIP）與訪客快速登入
const PRIMARY_ROLES = [
  {
    userId: 'u-017',
    label: 'VIP A（VIP 示範）',
    desc: '發局・邀請女伴・完整功能',
    badgeColor: 'bg-amber-100 text-amber-600',
    emoji: '👑',
  },
  {
    userId: 'u-021',
    label: 'VIP B（張偉宏）',
    desc: '發局・邀請女伴・完整功能',
    badgeColor: 'bg-yellow-100 text-yellow-700',
    emoji: '⭐',
  },
  {
    userId: 'u-099',
    label: '訪客',
    desc: '只看 3 位在線・其餘需登入',
    badgeColor: 'bg-zinc-100 text-zinc-500',
    emoji: '👀',
  },
];

// 幹部帳號（動態取自 mock users，role === 'manager'）
const MANAGER_ROLES = users
  .filter((u) => u.role === 'manager')
  .map((u) => ({ userId: u.id, label: u.nickname, avatarUrl: u.avatarUrl, area: u.defaultArea }));

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  function handleLogin(userId: string) {
    setLoading(userId);
    resetState();
    // 寫入選擇的身份
    try {
      const raw = localStorage.getItem('sl_state_v3');
      const parsed = raw ? JSON.parse(raw) : {};
      localStorage.setItem('sl_state_v3', JSON.stringify({ ...parsed, currentUserId: userId }));
    } catch {}
    setTimeout(() => {
      const onboarded = localStorage.getItem('sl_onboarded');
      if (onboarded === 'true') {
        router.push('/lobby/explore');
      } else {
        router.push('/onboarding');
      }
    }, 400);
  }

  return (
    <div className="min-h-screen flex flex-col bg-brand-snow">
      {/* Hero gradient */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 pb-8 pt-16">
        {/* Background blobs */}
        <div className="absolute top-0 left-0 right-0 h-72 bg-gradient-card-a opacity-60 rounded-b-[60px]" />
        <div className="absolute top-8 right-4 w-32 h-32 bg-brand-pink/30 rounded-full blur-3xl" />
        <div className="absolute top-16 left-4 w-24 h-24 bg-brand-sky/40 rounded-full blur-2xl" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center w-full max-w-sm">
          {/* Logo */}
          <div className="mb-2">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-2xl bg-gradient-sky-pink flex items-center justify-center shadow-fab">
                <span className="text-white font-bold text-lg">S</span>
              </div>
              <span className="text-2xl font-bold text-brand-ink tracking-tight">Social Lobby</span>
            </div>
          </div>
          <p className="text-zinc-500 text-sm mb-10">今晚一起出去吧</p>

          {/* Illustration placeholder */}
          <div className="w-56 h-56 rounded-3xl bg-gradient-card-c flex items-center justify-center mb-10 shadow-card-pink">
            <div className="flex flex-col items-center gap-3">
              <div className="flex gap-2">
                {['👋', '🍻', '🎉'].map((e, i) => (
                  <div key={i} className="w-14 h-14 rounded-2xl bg-white/60 flex items-center justify-center text-2xl shadow-sm">
                    {e}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-1">
                {['🎵', '🌃'].map((e, i) => (
                  <div key={i} className="w-14 h-14 rounded-2xl bg-white/60 flex items-center justify-center text-2xl shadow-sm">
                    {e}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-3xl font-bold text-brand-ink text-center mb-2 leading-tight">
            找人一起出去
          </h1>
          <p className="text-zinc-500 text-sm text-center mb-10">
            台北最即時的社交配對平台
          </p>

          {/* 客戶 / 訪客登入 */}
          <div className="w-full flex flex-col gap-3 mb-4">
            {PRIMARY_ROLES.map((role) => (
              <button
                key={role.userId}
                onClick={() => handleLogin(role.userId)}
                disabled={loading !== null}
                className="w-full flex items-center gap-4 bg-white border-2 border-brand-lavender rounded-2xl px-4 py-3.5 shadow-sm active:scale-[0.98] transition-all disabled:opacity-60 text-left"
                aria-label={`以 ${role.label} 身份使用 LINE 登入`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0 ${role.badgeColor}`}>
                  {loading === role.userId ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  ) : role.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-brand-ink">{role.label}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{role.desc}</p>
                </div>
                <div className="shrink-0 flex items-center gap-1.5 bg-line-green text-white text-xs font-semibold px-3 py-1.5 rounded-xl">
                  <LineIcon />
                  登入
                </div>
              </button>
            ))}
          </div>

          {/* 幹部登入（10 個帳號，緊湊清單）*/}
          <div className="w-full">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 px-1">
              幹部登入（{MANAGER_ROLES.length}）
            </p>
            <div className="max-h-56 overflow-y-auto rounded-2xl border border-brand-lavender bg-white divide-y divide-brand-lavender/60">
              {MANAGER_ROLES.map((m) => (
                <button
                  key={m.userId}
                  onClick={() => handleLogin(m.userId)}
                  disabled={loading !== null}
                  className="w-full flex items-center gap-3 px-3 py-2.5 active:bg-brand-snow transition-colors disabled:opacity-60 text-left"
                  aria-label={`以 ${m.label} 身份登入`}
                >
                  <img src={m.avatarUrl} alt="" aria-hidden className="w-8 h-8 rounded-full object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand-ink truncate">🎯 {m.label}</p>
                    <p className="text-[11px] text-zinc-400">{m.area}</p>
                  </div>
                  {loading === m.userId ? (
                    <svg className="w-4 h-4 animate-spin text-line-green" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  ) : (
                    <span className="shrink-0 text-[11px] font-semibold text-line-green">登入 ›</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-zinc-400 text-center mt-4">
            一鍵登入，馬上找人一起出去
          </p>

          <p className="text-xs text-zinc-400 text-center mt-6">
            登入即表示你同意{' '}
            <button className="underline">服務條款</button>
            {' '}與{' '}
            <button className="underline">隱私權政策</button>
          </p>
        </div>
      </div>
    </div>
  );
}
