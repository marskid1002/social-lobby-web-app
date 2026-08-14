'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, MoreVertical, UserPlus, UserCheck, MapPin, Clock, Users, X } from 'lucide-react';
import { useAppState } from '@/lib/state';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { TAIPEI_AREAS } from '@/lib/mock';
import type { RequestType } from '@/lib/mock';
import { activeConfirmedGirlIds } from '@/lib/request-attendance';


const REQUEST_TYPES: { value: RequestType; label: string; emoji: string }[] = [
  { value: 'after_party', label: 'After Party', emoji: '🎉' },
  { value: 'drinking',    label: '喝酒',        emoji: '🍻' },
  { value: 'fill_spot',   label: '補位',        emoji: '🙋' },
  { value: 'last_minute', label: '臨時約會',    emoji: '⚡' },
  { value: 'other',       label: '其他',        emoji: '✨' },
];

const TIME_OPTIONS = ['現在', '1小時後', '2小時後', '今晚 9pm', '今晚 11pm', '明天'];

export default function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { state, toggleFollow, blockUser, sendInvite } = useAppState();
  // 「已見面」徽章 7 天內有效（與 /me 的近期見面窗一致，避免永久顯示）
  const hasMet = state.meetRecords.some((r) => r.userId === id && new Date(r.expiresAt).getTime() > Date.now());
  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  const user = state.users.find((u) => u.id === id);
  const gallery = state.photoGalleries.find((g) => g.id === id)?.urls ?? [];

  useEffect(() => {
    if (lightboxIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setLightboxIndex(null);
      if (event.key === 'ArrowLeft') {
        setLightboxIndex((current) => current === null ? null : (current - 1 + gallery.length) % gallery.length);
      }
      if (event.key === 'ArrowRight') {
        setLightboxIndex((current) => current === null ? null : (current + 1) % gallery.length);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [gallery.length, lightboxIndex]);

  function showPreviousPhoto() {
    setLightboxIndex((current) => current === null ? null : (current - 1 + gallery.length) % gallery.length);
  }

  function showNextPhoto() {
    setLightboxIndex((current) => current === null ? null : (current + 1) % gallery.length);
  }

  function handleLightboxTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleLightboxTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const startX = touchStartX.current;
    const endX = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (startX === null || endX === undefined || gallery.length < 2) return;
    const distance = endX - startX;
    if (Math.abs(distance) < 50) return;
    if (distance > 0) showPreviousPhoto();
    else showNextPhoto();
  }

  // Private invite form state
  const [inviteType, setInviteType] = useState<RequestType>('drinking');
  const [inviteArea, setInviteArea] = useState(state.users.find((u) => u.id === id)?.defaultArea ?? '信義區');
  const [inviteTime, setInviteTime] = useState('現在');
  const [inviteCount, setInviteCount] = useState(2);
  const [inviteNote, setInviteNote] = useState('');

  if (!user) return <div className="p-8 text-center text-zinc-400">找不到此用戶</div>;

  const onlineStatus = state.onlineStatuses.find((s) => s.userId === id);
  const isBusy = activeConfirmedGirlIds(state.responses, state.invitations).has(id);
  const isFollowing = state.follows.some(
    (f) => f.followerId === state.currentUserId && f.followingId === id
  );

  const currentUser = state.users.find((u) => u.id === state.currentUserId);
  const isVip = currentUser?.tier === 'vip';
  const canSendPrivateInvite = isVip
    && currentUser?.role === 'user'
    && user.role === 'escort'
    && id !== state.currentUserId;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }

  function handleFollow() {
    toggleFollow(id);
    showToast(isFollowing ? '已取消關注' : '已關注');
  }

  function handleBlock() {
    blockUser(id);
    setMenuOpen(false);
    setToast('已封鎖');
    setTimeout(() => { setToast(''); router.back(); }, 1000);
  }

  async function handleReport() {
    setMenuOpen(false);
    // 詢問檢舉原因（提供給管理員審核）；取消則不送出
    const reason = typeof window !== 'undefined' ? window.prompt('請簡述檢舉原因（會提供給管理員審核）：') : '';
    if (reason === null) return;
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: id, targetName: user?.nickname, reason: reason.trim() }),
      });
      showToast(res.ok ? '已檢舉，我們會盡快處理' : '檢舉失敗');
    } catch { showToast('連線失敗'); }
  }

  function handleSendPrivateInvite() {
    const message = [
      `活動類型：${REQUEST_TYPES.find((t) => t.value === inviteType)?.label}`,
      `地點：${inviteArea}`,
      `時間：${inviteTime}`,
      `人數：${inviteCount} 人`,
      inviteNote ? `備註：${inviteNote}` : '',
    ].filter(Boolean).join('　');

    sendInvite(id, null, message);
    setInviteOpen(false);
    showToast('私人邀請已送出 🎉');
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="relative flex items-center justify-between bg-white px-4 py-3">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-snow active:scale-95"
          aria-label="返回"
        >
          <ArrowLeft className="h-5 w-5 text-brand-ink" strokeWidth={1.75} />
        </button>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-snow active:scale-95"
          aria-label="更多選項"
        >
          <MoreVertical className="h-5 w-5 text-brand-ink" strokeWidth={1.75} />
        </button>

        {menuOpen && (
          <div className="absolute top-14 right-4 z-20 bg-white rounded-2xl shadow-xl border border-brand-lavender overflow-hidden min-w-32">
            <button onClick={handleBlock} className="w-full px-4 py-3 text-sm text-red-500 font-medium text-left hover:bg-red-50">
              封鎖
            </button>
            <button
              onClick={handleReport}
              className="w-full px-4 py-3 text-sm text-zinc-600 font-medium text-left hover:bg-brand-snow border-t border-brand-lavender"
            >
              檢舉
            </button>
          </div>
        )}
      </div>

      {/* White card */}
      <div className="relative bg-white px-5 pb-6 pt-2">
        <div className="mb-3 flex justify-center">
          <img
            src={user.avatarUrl}
            alt={user.nickname}
            className="h-28 w-28 rounded-full object-cover ring-4 ring-white shadow-card-pink"
          />
        </div>

        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl font-semibold text-brand-ink">{user.nickname}</h1>
            {hasMet && <span className="text-xl" title="已見面">⭐</span>}
          </div>
          {hasMet && <p className="text-xs text-zinc-400 mt-0.5">你們已經見過面了</p>}
          {user.bio && <p className="text-sm text-zinc-500 mt-1">{user.bio}</p>}
        </div>

        {onlineStatus && (
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-brand-snow border border-brand-lavender">
              <span className={`w-2 h-2 rounded-full ${isBusy ? 'bg-pink-500' : 'bg-green-400'}`} />
              <span className="text-xs font-medium text-brand-ink">
                {isBusy ? '忙碌中' : '上線'} · {onlineStatus.area} ·{' '}
                {formatDistanceToNow(new Date(onlineStatus.lastSeen), { locale: zhTW, addSuffix: true })}
              </span>
            </div>
          </div>
        )}

        {/* Two action buttons — Follow + Private Invite */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={handleFollow}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm transition-colors active:scale-[0.98] ${
              isFollowing ? 'bg-brand-lavender text-zinc-500' : 'bg-brand-pink text-brand-ink shadow-card-pink'
            }`}
          >
            {isFollowing ? <UserCheck className="w-4 h-4" strokeWidth={1.75} /> : <UserPlus className="w-4 h-4" strokeWidth={1.75} />}
            {isFollowing ? '已關注' : '關注'}
          </button>
          {canSendPrivateInvite && (
            <button
              onClick={() => setInviteOpen(true)}
              className="flex-1 py-3 rounded-2xl font-semibold text-sm bg-brand-sky text-brand-ink active:scale-[0.98] transition-all shadow-card"
            >
              發訊息
            </button>
          )}
          {/* 非 VIP 的「🔒 發訊息（升級）」鎖按鈕暫時隱藏（付費功能尚未開放）*/}
        </div>

        {user.interests.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-semibold text-brand-ink mb-2">興趣</p>
            <div className="flex flex-wrap gap-2">
              {user.interests.map((interest) => (
                <span key={interest} className="px-3 py-1.5 rounded-full bg-brand-ice text-xs font-medium text-brand-ink border border-brand-lavender">
                  {interest}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 相簿 */}
        <div className="mb-2">
          <p className="text-sm font-semibold text-brand-ink mb-2">相簿</p>
          {gallery.length === 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-2xl bg-brand-lavender/40 flex items-center justify-center">
                  <span className="text-xl opacity-40">📷</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {gallery.map((url, index) => (
                <button
                  key={url}
                  onClick={() => setLightboxIndex(index)}
                  className="aspect-square rounded-2xl overflow-hidden active:scale-[0.97] transition-transform"
                  aria-label="查看照片"
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 相簿大圖 lightbox */}
      {lightboxIndex !== null && gallery[lightboxIndex] && (
        <div
          className="fixed inset-0 z-[80] flex touch-none items-center justify-center overflow-hidden bg-black overscroll-none"
          onClick={() => setLightboxIndex(null)}
          onTouchStart={handleLightboxTouchStart}
          onTouchEnd={handleLightboxTouchEnd}
          role="dialog"
          aria-modal="true"
          aria-label="相簿照片預覽"
        >
          <img
            src={gallery[lightboxIndex]}
            alt={`${user.nickname} 的相簿照片 ${lightboxIndex + 1}`}
            className="h-full w-full select-none object-contain"
            draggable={false}
            onClick={(event) => event.stopPropagation()}
          />
          <button
            onClick={(event) => { event.stopPropagation(); setLightboxIndex(null); }}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 text-white flex items-center justify-center"
            aria-label="關閉"
          >
            <X className="w-5 h-5" />
          </button>
          {gallery.length > 1 && (
            <>
              <button
                onClick={(event) => { event.stopPropagation(); showPreviousPhoto(); }}
                className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white"
                aria-label="上一張照片"
              >
                <ChevronLeft className="h-7 w-7" />
              </button>
              <button
                onClick={(event) => { event.stopPropagation(); showNextPhoto(); }}
                className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white"
                aria-label="下一張照片"
              >
                <ChevronRight className="h-7 w-7" />
              </button>
              <div className="absolute bottom-5 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
                {lightboxIndex + 1} / {gallery.length}
              </div>
            </>
          )}
        </div>
      )}

      {/* Private invite sheet */}
      {inviteOpen && (
        <div className="app-modal-layer fixed inset-0 flex items-end justify-center" onClick={() => setInviteOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="app-bottom-sheet relative w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-4" />

            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <img src={user.avatarUrl} alt={user.nickname} className="w-10 h-10 rounded-full object-cover" />
              <div>
                <h3 className="text-base font-semibold text-brand-ink">邀請 {user.nickname}</h3>
                <p className="text-xs text-zinc-400">私人邀請，對方接受後才能聊天</p>
              </div>
            </div>

            {/* Activity type */}
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">活動類型</p>
            <div className="flex gap-2 flex-wrap mb-5">
              {REQUEST_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setInviteType(t.value)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-sm font-semibold transition-colors ${
                    inviteType === t.value
                      ? 'bg-brand-sky text-brand-ink shadow-card'
                      : 'bg-brand-snow text-zinc-500 border border-brand-lavender'
                  }`}
                >
                  <span>{t.emoji}</span> {t.label}
                </button>
              ))}
            </div>

            {/* Area */}
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              <MapPin className="inline w-3 h-3 mr-1" />地點
            </p>
            <div className="flex gap-2 flex-wrap mb-5">
              {TAIPEI_AREAS.slice(0, 6).map((area) => (
                <button
                  key={area}
                  onClick={() => setInviteArea(area)}
                  className={`px-3 py-2 rounded-2xl text-xs font-semibold transition-colors ${
                    inviteArea === area
                      ? 'bg-brand-ink text-white'
                      : 'bg-brand-snow text-zinc-500 border border-brand-lavender'
                  }`}
                >
                  {area}
                </button>
              ))}
            </div>

            {/* Time */}
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              <Clock className="inline w-3 h-3 mr-1" />時間
            </p>
            <div className="flex gap-2 flex-wrap mb-5">
              {TIME_OPTIONS.map((t) => (
                <button
                  key={t}
                  onClick={() => setInviteTime(t)}
                  className={`px-3 py-2 rounded-2xl text-xs font-semibold transition-colors ${
                    inviteTime === t
                      ? 'bg-brand-pink text-brand-ink shadow-card-pink'
                      : 'bg-brand-snow text-zinc-500 border border-brand-lavender'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* People count */}
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              <Users className="inline w-3 h-3 mr-1" />人數
            </p>
            <div className="flex items-center gap-4 mb-5">
              <button
                onClick={() => setInviteCount(Math.max(2, inviteCount - 1))}
                className="w-9 h-9 rounded-full bg-brand-snow border border-brand-lavender text-xl font-bold text-brand-ink flex items-center justify-center active:scale-95"
              >
                −
              </button>
              <span className="text-lg font-semibold text-brand-ink w-6 text-center">{inviteCount}</span>
              <button
                onClick={() => setInviteCount(Math.min(20, inviteCount + 1))}
                className="w-9 h-9 rounded-full bg-brand-snow border border-brand-lavender text-xl font-bold text-brand-ink flex items-center justify-center active:scale-95"
              >
                +
              </button>
              <span className="text-sm text-zinc-400">人</span>
            </div>

            {/* Personal message */}
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">個人訊息</p>
            <textarea
              value={inviteNote}
              onChange={(e) => setInviteNote(e.target.value)}
              placeholder={`嗨 ${user.nickname}！今晚想一起出去嗎？`}
              maxLength={150}
              rows={3}
              className="w-full rounded-2xl border border-brand-lavender bg-brand-snow px-4 py-3 text-sm text-brand-ink placeholder:text-zinc-400 resize-none focus:outline-none focus:ring-2 focus:ring-brand-sky mb-1"
            />
            <p className="text-xs text-zinc-400 text-right mb-5">{inviteNote.length}/150</p>

            <button
              onClick={handleSendPrivateInvite}
              disabled={!inviteNote.trim()}
              className="sticky bottom-0 z-10 w-full py-3.5 rounded-2xl bg-brand-sky text-brand-ink font-semibold text-sm active:scale-[0.98] transition-all shadow-card disabled:opacity-50 disabled:cursor-not-allowed"
            >
              送出私人邀請
            </button>
            <p className="text-xs text-zinc-400 text-center mt-3">
              {!inviteNote.trim() ? '請填寫個人訊息才能送出邀請' : '對方接受後，你們才能開始聊天'}
            </p>
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
