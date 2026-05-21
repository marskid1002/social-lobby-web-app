'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MoreVertical, UserPlus, UserCheck } from 'lucide-react';
import { useAppState } from '@/lib/state';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';

const STATUS_LABELS: Record<string, string> = {
  available: '可接局',
  fill_spot: '可補位',
  bring_people: '可帶人',
  busy: '忙碌',
};

const STATUS_COLORS: Record<string, string> = {
  available: '#10B981',
  fill_spot: '#F59E0B',
  bring_people: '#3B82F6',
  busy: '#6B7280',
};

const CARD_GRADIENTS = ['bg-gradient-card-a', 'bg-gradient-card-b', 'bg-gradient-card-c'];

export default function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { state, toggleFollow, sendInvite, blockUser } = useAppState();
  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const user = state.users.find((u) => u.id === id);
  if (!user) return <div className="p-8 text-center text-zinc-400">找不到此用戶</div>;

  const onlineStatus = state.onlineStatuses.find((s) => s.userId === id);
  const isFollowing = state.follows.some(
    (f) => f.followerId === state.currentUserId && f.followingId === id
  );

  const myOpenRequests = state.requests.filter(
    (r) => r.creatorId === state.currentUserId && r.status === 'open'
  );

  const heroGradient = CARD_GRADIENTS[parseInt(id.replace('u-', ''), 10) % 3];

  function handleFollow() {
    toggleFollow(id);
    setToast(isFollowing ? '已取消關注' : '已關注');
    setTimeout(() => setToast(''), 2000);
  }

  function handleInvite(requestId: string) {
    sendInvite(id, requestId);
    setInviteOpen(false);
    setToast('邀請已送出');
    setTimeout(() => setToast(''), 2000);
  }

  function handleBlock() {
    blockUser(id);
    setMenuOpen(false);
    setToast('已封鎖');
    setTimeout(() => {
      setToast('');
      router.back();
    }, 1000);
  }

  return (
    <div className="min-h-screen bg-brand-snow">
      {/* Hero */}
      <div className={`relative h-52 ${heroGradient}`}>
        {/* Top bar over hero */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-4 z-10">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white/70 backdrop-blur flex items-center justify-center active:scale-95"
            aria-label="返回"
          >
            <ArrowLeft className="w-5 h-5 text-brand-ink" strokeWidth={1.75} />
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-9 h-9 rounded-full bg-white/70 backdrop-blur flex items-center justify-center active:scale-95"
            aria-label="更多選項"
          >
            <MoreVertical className="w-5 h-5 text-brand-ink" strokeWidth={1.75} />
          </button>
        </div>

        {/* Kebab menu */}
        {menuOpen && (
          <div className="absolute top-14 right-4 z-20 bg-white rounded-2xl shadow-xl border border-brand-lavender overflow-hidden min-w-32">
            <button
              onClick={handleBlock}
              className="w-full px-4 py-3 text-sm text-red-500 font-medium text-left hover:bg-red-50"
            >
              封鎖
            </button>
            <button
              onClick={() => { setMenuOpen(false); setToast('已檢舉'); setTimeout(() => setToast(''), 2000); }}
              className="w-full px-4 py-3 text-sm text-zinc-600 font-medium text-left hover:bg-brand-snow border-t border-brand-lavender"
            >
              檢舉
            </button>
          </div>
        )}
      </div>

      {/* White card overlapping hero */}
      <div className="relative -mt-8 bg-white rounded-t-[40px] px-5 pb-6">
        {/* Avatar centered, half on gradient */}
        <div className="flex justify-center -mt-14 mb-3">
          <img
            src={user.avatarUrl}
            alt={user.nickname}
            className="w-28 h-28 rounded-full object-cover ring-4 ring-white shadow-card-pink"
          />
        </div>

        {/* Name & bio */}
        <div className="text-center mb-4">
          <h1 className="text-2xl font-semibold text-brand-ink">{user.nickname}</h1>
          {user.bio && <p className="text-sm text-zinc-500 mt-1">{user.bio}</p>}
        </div>

        {/* Status pill */}
        {onlineStatus && (
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-brand-snow border border-brand-lavender">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[onlineStatus.status] }} />
              <span className="text-xs font-medium text-brand-ink">
                {STATUS_LABELS[onlineStatus.status]} · {onlineStatus.area} ·{' '}
                {formatDistanceToNow(new Date(onlineStatus.lastSeen), { locale: zhTW, addSuffix: true })}
              </span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={handleFollow}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm transition-colors active:scale-[0.98] ${
              isFollowing
                ? 'bg-brand-lavender text-zinc-500'
                : 'bg-brand-pink text-brand-ink shadow-card-pink'
            }`}
          >
            {isFollowing ? <UserCheck className="w-4 h-4" strokeWidth={1.75} /> : <UserPlus className="w-4 h-4" strokeWidth={1.75} />}
            {isFollowing ? '已關注' : '關注'}
          </button>
          <button
            onClick={() => setInviteOpen(true)}
            className="flex-1 py-3 rounded-2xl bg-brand-sky text-brand-ink font-semibold text-sm active:scale-[0.98] transition-all shadow-card"
          >
            邀請
          </button>
        </div>

        {/* Interests */}
        {user.interests.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-semibold text-brand-ink mb-2">興趣</p>
            <div className="flex flex-wrap gap-2">
              {user.interests.map((interest) => (
                <span
                  key={interest}
                  className="px-3 py-1.5 rounded-full bg-brand-ice text-xs font-medium text-brand-ink border border-brand-lavender"
                >
                  {interest}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Media grid placeholder */}
        {/* TODO: wire up user_media once we decide on MVP scope */}
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-2xl bg-brand-lavender/40" />
          ))}
        </div>
      </div>

      {/* Invite dialog */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setInviteOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[430px] bg-white rounded-t-[28px] p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-4" />
            <h3 className="text-base font-semibold text-brand-ink mb-4">邀請 {user.nickname}</h3>
            {myOpenRequests.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-zinc-400 mb-4">先發布一個需求</p>
                <button
                  onClick={() => { setInviteOpen(false); router.push('/requests/new'); }}
                  className="px-6 py-2.5 rounded-2xl bg-brand-sky text-brand-ink font-semibold text-sm"
                >
                  發布需求
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {myOpenRequests.map((req) => (
                  <button
                    key={req.id}
                    onClick={() => handleInvite(req.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl bg-brand-snow border border-brand-lavender text-left active:bg-brand-ice transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-ink truncate">{req.note || '需求'}</p>
                      <p className="text-xs text-zinc-400">{req.area} · {req.peopleCount} 人</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-brand-ink text-white text-sm rounded-full px-5 py-2.5 shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
