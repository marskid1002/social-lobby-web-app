'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, X, Plus, Camera } from 'lucide-react';
import { useAppState } from '@/lib/state';
import { uploadChatImage } from '@/lib/image';
import { AREA_CITIES, AREA_OPTIONS, cityForArea, type AreaCity } from '@/lib/area-options';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const TIER_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  free:     { label: '基本',   bg: '#6B728020', color: '#6B7280' },
  standard: { label: '標準',   bg: '#3B82F620', color: '#3B82F6' },
  premium:  { label: '進階',   bg: '#A78BFA20', color: '#A78BFA' },
  vip:      { label: 'VIP',    bg: '#F59E0B20', color: '#F59E0B' },
};

export default function MyProfilePage() {
  const { state, currentUser, updateUser, setPhotoOverride } = useAppState();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [nickname, setNickname] = useState(currentUser?.nickname ?? '');
  const initialArea = currentUser?.defaultArea ?? '信義區';
  const [city, setCity] = useState<AreaCity>(() => cityForArea(initialArea));
  const [area, setArea] = useState(initialArea);
  const [bio, setBio] = useState(currentUser?.bio ?? '');
  const [interests, setInterests] = useState<string[]>(currentUser?.interests ?? []);
  const [newInterest, setNewInterest] = useState('');
  const [toast, setToast] = useState('');

  const districtOptions = AREA_OPTIONS[city] as readonly string[];
  const isLegacyArea = area !== '' && !districtOptions.includes(area);

  function handleCityChange(nextCity: AreaCity) {
    setCity(nextCity);
    setArea(AREA_OPTIONS[nextCity][0]);
  }

  // 訪客沒有個人檔案 → 導回大廳
  useEffect(() => {
    if (currentUser && currentUser.tier === 'guest') router.replace('/lobby/explore');
  }, [currentUser, router]);

  if (!currentUser) return null;
  if (currentUser.tier === 'guest') return null;

  const tier = TIER_STYLES[currentUser.tier] ?? TIER_STYLES.free;

  function handleSave() {
    updateUser({ nickname, defaultArea: area, bio, interests });
    setEditOpen(false);
    setToast('已儲存');
    setTimeout(() => setToast(''), 2000);
  }

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || avatarBusy || !currentUser) return;
    setAvatarBusy(true);
    try {
      const url = await uploadChatImage(file);
      // 幹部/管理員是種子用戶，直接改 avatarUrl 會被還原邏輯蓋回 → 走 photoOverride（優先級最高、也同步）；
      // 客戶(c-)非種子，用 updateUser 即可（會同步進 registeredUsers）。
      if (currentUser.role === 'manager') setPhotoOverride(currentUser.id, url);
      else updateUser({ avatarUrl: url });
      setToast('已更新頭像');
      setTimeout(() => setToast(''), 2000);
    } catch (err) {
      setToast(`⚠️ ${err instanceof Error ? err.message : '上傳失敗'}`);
      setTimeout(() => setToast(''), 5000);
    } finally {
      setAvatarBusy(false);
    }
  }

  function addInterest() {
    if (newInterest.trim() && !interests.includes(newInterest.trim())) {
      setInterests([...interests, newInterest.trim()]);
      setNewInterest('');
    }
  }

  return (
    <div className="min-h-screen bg-brand-snow">
      {/* Hero */}
      <div className="relative h-32 bg-gradient-card-c">
        <div className="absolute top-4 left-4">
          <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-white/70 backdrop-blur flex items-center justify-center" aria-label="返回">
            <svg className="w-5 h-5 text-brand-ink" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative -mt-8 bg-white rounded-t-[40px] px-5 pb-8">
        <div className="flex justify-center -mt-14 mb-3">
          <div className="relative">
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.nickname}
              className="w-28 h-28 rounded-full object-cover ring-4 ring-white shadow-card"
            />
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarBusy}
              aria-label="更換頭像"
              className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-brand-sky text-brand-ink flex items-center justify-center shadow-md ring-2 ring-white active:scale-95 disabled:opacity-60"
            >
              {avatarBusy ? <span className="text-xs">…</span> : <Camera className="w-4 h-4" strokeWidth={1.75} />}
            </button>
          </div>
        </div>

        <div className="text-center mb-4">
          <h1 className="text-2xl font-semibold text-brand-ink">{currentUser.nickname}</h1>
          {currentUser.bio && <p className="text-sm text-zinc-500 mt-1">{currentUser.bio}</p>}
        </div>

        {/* Edit button（訪客已在上方導離，不會到這裡）*/}
        <button
          onClick={() => setEditOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-brand-sky text-brand-ink font-semibold text-sm mb-4 shadow-card active:scale-[0.98] transition-all"
        >
          <Pencil className="w-4 h-4" strokeWidth={1.75} /> 編輯個人檔案
        </button>

        {/* Info row */}
        <div className="flex items-center justify-center gap-3 mb-4 flex-wrap">
          <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: tier.bg, color: tier.color }}>
            {tier.label}
          </span>
          {/* 點數顯示暫時隱藏（收費功能尚未開放）*/}
          <span className="text-xs text-zinc-400">加入於 2026 年 4 月</span>
        </div>

        {/* 發局次數：目前不限量（暫不收費） */}
        <div className="flex items-center justify-between bg-brand-ice rounded-2xl px-4 py-3 mb-4">
          <div>
            <p className="text-xs font-semibold text-brand-ink">發局</p>
            <p className="text-xs text-zinc-400 mt-0.5">目前不限次數</p>
          </div>
          <span className="text-2xl font-bold text-brand-ink">∞</span>
        </div>

        {/* 收費/商城入口暫時隱藏（付費功能尚未開放）*/}

        {/* Interests */}
        {currentUser.interests.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-semibold text-brand-ink mb-2">興趣</p>
            <div className="flex flex-wrap gap-2">
              {currentUser.interests.map((interest) => (
                <span key={interest} className="px-3 py-1.5 rounded-full bg-brand-ice text-xs font-medium text-brand-ink border border-brand-lavender">
                  {interest}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recent meets (7-day window) */}
        {(() => {
          const recentMeets = state.meetRecords.filter(
            (r) => new Date(r.expiresAt).getTime() > Date.now()
          );
          if (recentMeets.length === 0) return null;
          return (
            <div className="mb-6">
              <p className="text-sm font-semibold text-brand-ink mb-2">近期見面記錄</p>
              <div className="flex flex-wrap gap-2">
                {recentMeets.map((r) => {
                  const metUser = state.users.find((u) => u.id === r.userId);
                  if (!metUser) return null;
                  return (
                    <button
                      key={r.userId}
                      onClick={() => router.push(`/u/${metUser.id}`)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-ice border border-brand-lavender active:bg-brand-sky/20 transition-colors"
                    >
                      <img src={metUser.avatarUrl} alt={metUser.nickname} className="w-5 h-5 rounded-full object-cover" />
                      <span className="text-xs font-medium text-brand-ink">{metUser.nickname}</span>
                      <span className="text-[10px] text-zinc-400">
                        {formatDistanceToNow(new Date(r.metAt), { locale: zhTW, addSuffix: true })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Media grid（未接線的佔位；幹部不顯示——幹部不會被客戶瀏覽，個人相簿無意義）*/}
        {currentUser.role !== 'manager' && (
          <div className="grid grid-cols-3 gap-2">
            <div className="aspect-square rounded-2xl bg-brand-pink/30 flex items-center justify-center">
              <Plus className="w-6 h-6 text-brand-ink/40" strokeWidth={1.75} />
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-2xl bg-brand-lavender/40" />
            ))}
          </div>
        )}
      </div>

      {/* Edit sheet */}
      {editOpen && (
        <div className="app-modal-layer fixed inset-0 flex items-end justify-center" onClick={() => setEditOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="app-bottom-sheet relative w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-brand-ink">編輯個人檔案</h2>
              <button onClick={() => setEditOpen(false)} aria-label="關閉"><X className="w-5 h-5 text-zinc-400" strokeWidth={1.75} /></button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-brand-ink">暱稱</label>
                <input value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full rounded-2xl border border-brand-lavender bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-sky" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-brand-ink">區域</label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={city}
                    onChange={(event) => handleCityChange(event.target.value as AreaCity)}
                    aria-label="縣市"
                    className="w-full rounded-2xl border border-brand-lavender bg-white px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-sky appearance-none"
                  >
                    {AREA_CITIES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <select
                    value={area}
                    onChange={(event) => setArea(event.target.value)}
                    aria-label="行政區"
                    className="w-full rounded-2xl border border-brand-lavender bg-white px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-sky appearance-none"
                  >
                    {isLegacyArea && <option value={area}>{area}</option>}
                    {districtOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-brand-ink">自我介紹</label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={100} className="w-full rounded-2xl border border-brand-lavender bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-sky resize-none" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-brand-ink">興趣</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {interests.map((i) => (
                    <button key={i} onClick={() => setInterests(interests.filter((x) => x !== i))} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-brand-ice text-xs font-medium text-brand-ink border border-brand-lavender">
                      {i} <X className="w-3 h-3" />
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={newInterest} onChange={(e) => setNewInterest(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addInterest()} placeholder="新增興趣" className="flex-1 rounded-2xl border border-brand-lavender bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-sky" />
                  <button onClick={addInterest} className="w-10 h-10 rounded-full bg-brand-sky flex items-center justify-center" aria-label="新增">
                    <Plus className="w-4 h-4 text-brand-ink" strokeWidth={2} />
                  </button>
                </div>
              </div>

              <button onClick={handleSave} className="sticky bottom-0 z-10 w-full py-3.5 rounded-2xl bg-brand-sky text-brand-ink font-semibold text-base active:scale-[0.98] transition-all shadow-card mt-2">
                儲存
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="app-toast-layer fixed bottom-24 left-1/2 -translate-x-1/2 bg-brand-ink text-white text-sm rounded-full px-5 py-2.5 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
