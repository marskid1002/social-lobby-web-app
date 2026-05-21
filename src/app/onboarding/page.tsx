'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { TAIPEI_AREAS } from '@/lib/mock';

export default function OnboardingPage() {
  const router = useRouter();
  const { currentUser, updateUser } = useAppState();

  const [nickname, setNickname] = useState(currentUser?.nickname ?? '');
  const [area, setArea] = useState(currentUser?.defaultArea ?? '信義區');
  const [bio, setBio] = useState(currentUser?.bio ?? '');
  const [oaToast, setOaToast] = useState(false);

  function handleContinue() {
    if (!nickname.trim()) return;
    updateUser({ nickname: nickname.trim(), defaultArea: area, bio });
    localStorage.setItem('sl_onboarded', 'true');
    router.push('/lobby/explore');
  }

  function handleFollowOA() {
    setOaToast(true);
    setTimeout(() => setOaToast(false), 2000);
  }

  return (
    <div className="min-h-screen bg-brand-snow flex flex-col">
      {/* Hero strip */}
      <div className="h-32 bg-gradient-sky-pink relative flex items-end px-5 pb-4">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-4 right-8 w-16 h-16 bg-white/40 rounded-full" />
          <div className="absolute top-8 right-20 w-8 h-8 bg-white/30 rounded-full" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-brand-ink">完成設定</h1>
          <p className="text-sm text-brand-ink/60">再三步就能開始</p>
        </div>
      </div>

      <div className="flex-1 px-5 py-6 flex flex-col gap-5">
        {/* Avatar row */}
        <div className="flex justify-center">
          <div className="relative">
            <img
              src={currentUser?.avatarUrl}
              alt={currentUser?.nickname}
              className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-card"
            />
            <button
              className="absolute bottom-0 right-0 w-7 h-7 bg-brand-sky rounded-full flex items-center justify-center shadow-sm"
              aria-label="更換頭像"
            >
              <svg className="w-3.5 h-3.5 text-brand-ink" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Nickname */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-brand-ink" htmlFor="nickname">暱稱</label>
          <input
            id="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full rounded-2xl border border-brand-lavender bg-white px-4 py-3 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-sky"
            placeholder="你的暱稱"
            maxLength={20}
          />
        </div>

        {/* Area */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-brand-ink" htmlFor="area">所在區域</label>
          <select
            id="area"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="w-full rounded-2xl border border-brand-lavender bg-white px-4 py-3 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-sky appearance-none"
          >
            {TAIPEI_AREAS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        {/* Bio */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-brand-ink" htmlFor="bio">簡短自我介紹（選填）</label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={100}
            className="w-full rounded-2xl border border-brand-lavender bg-white px-4 py-3 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-sky resize-none"
            placeholder="說說你是誰，喜歡做什麼..."
          />
        </div>

        {/* LINE OA card */}
        <div className="rounded-2xl border-2 border-line-green/30 bg-line-green/5 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-line-green rounded-xl flex items-center justify-center">
              <span className="text-white text-xs font-bold">L</span>
            </div>
            <p className="text-sm font-semibold text-brand-ink">加入官方 LINE 帳號接收通知</p>
          </div>
          <button
            onClick={handleFollowOA}
            className="w-full rounded-xl border-2 border-line-green text-line-green font-semibold text-sm py-2.5 bg-white active:bg-line-green/5 transition-colors"
          >
            + 加入好友
          </button>
          <p className="text-xs text-zinc-400 text-center">掃描 QR 碼或在 LINE 搜尋 @sociallobby</p>
        </div>

        {/* CTA */}
        <button
          onClick={handleContinue}
          disabled={!nickname.trim()}
          className="w-full rounded-2xl bg-brand-sky text-brand-ink font-semibold text-base py-4 active:scale-[0.98] transition-all disabled:opacity-40 shadow-card mt-2"
        >
          繼續
        </button>
      </div>

      {/* Toast */}
      {oaToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-brand-ink text-white text-sm rounded-full px-5 py-2.5 shadow-lg z-50">
          假裝你已加入！
        </div>
      )}
    </div>
  );
}
