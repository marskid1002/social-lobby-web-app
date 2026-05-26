'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { RequestCard } from '@/components/RequestCard';
import { OperatorHome } from '@/components/OperatorHome';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Lock, Crown } from 'lucide-react';

const DISTRICTS = ['全部', '信義區', '大安區', '中山區', '松山區'];

const STATUS_LABELS: Record<string, string> = {
  available: '可接局',
  bring_people: '可帶人',
  fill_spot: '補位',
  busy: '忙碌中',
};

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-100 text-green-700',
  bring_people: 'bg-blue-100 text-blue-700',
  fill_spot: 'bg-yellow-100 text-yellow-700',
  busy: 'bg-zinc-100 text-zinc-500',
};

function FemaleListRow({ userId }: { userId: string }) {
  const { state } = useAppState();
  const router = useRouter();
  const user = state.users.find((u) => u.id === userId);
  const onlineStatus = state.onlineStatuses.find((s) => s.userId === userId);

  if (!user || !onlineStatus) return null;

  return (
    <button
      onClick={() => router.push(`/u/${userId}`)}
      className="flex items-center gap-3 px-4 py-3 bg-white border-b border-zinc-100 w-full text-left active:bg-brand-snow transition-colors"
    >
      <div className="relative shrink-0">
        <img
          src={user.avatarUrl}
          alt={user.nickname}
          className="w-10 h-10 rounded-full object-cover"
        />
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-brand-ink truncate">{user.nickname}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[onlineStatus.status] ?? 'bg-zinc-100 text-zinc-500'}`}>
            {STATUS_LABELS[onlineStatus.status] ?? onlineStatus.status}
          </span>
        </div>
        <p className="text-xs text-zinc-400 mt-0.5">
          {onlineStatus.area} · {formatDistanceToNow(new Date(onlineStatus.lastSeen), { locale: zhTW, addSuffix: true })}
        </p>
      </div>
    </button>
  );
}

function ExploreContent() {
  const { state, currentUser } = useAppState();
  const [district, setDistrict] = useState('全部');

  if (currentUser?.role === 'operator') {
    return <OperatorHome />;
  }

  const isVip = currentUser?.tier === 'vip';

  const filteredRequests = state.requests
    .filter((r) => r.status === 'open' && (district === '全部' || r.area === district))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const femaleUserIds = state.onlineStatuses
    .filter((s) => {
      const u = state.users.find((u) => u.id === s.userId);
      return u && u.role === 'user' && u.id !== currentUser?.id;
    })
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
    .map((s) => s.userId);

  return (
    <div className="pb-24">
      {/* Section A */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-sm font-bold text-brand-ink uppercase tracking-wider mb-3">今晚有什麼局</p>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {DISTRICTS.map((d) => (
            <button
              key={d}
              onClick={() => setDistrict(d)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                district === d
                  ? 'bg-brand-ink text-white'
                  : 'bg-brand-snow text-zinc-500 border border-zinc-200'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4">
        {filteredRequests.length === 0 ? (
          <p className="text-sm text-zinc-400 text-center py-6">目前沒有開放的局</p>
        ) : (
          filteredRequests.map((req) => {
            const creator = state.users.find((u) => u.id === req.creatorId);
            return <RequestCard key={req.id} request={req} variant="ledger" creator={creator} />;
          })
        )}
      </div>

      {/* Section B divider */}
      <div className="flex items-center gap-3 px-4 py-3 bg-brand-snow border-y border-zinc-100">
        {isVip ? (
          <Crown size={14} className="text-amber-500 shrink-0" />
        ) : (
          <Lock size={14} className="text-zinc-400 shrink-0" />
        )}
        <p className="text-sm font-bold text-brand-ink uppercase tracking-wider">女生名單</p>
      </div>

      {/* Section B */}
      <div className="relative">
        <div className={isVip ? '' : 'filter blur-[6px] pointer-events-none select-none'}>
          {femaleUserIds.map((uid) => (
            <FemaleListRow key={uid} userId={uid} />
          ))}
        </div>

        {!isVip && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <span className="text-3xl">🔒</span>
              <p className="text-base font-bold text-brand-ink">升級解鎖女生名單</p>
              <p className="text-sm text-zinc-500">VIP 會員可瀏覽所有線上女生</p>
              <button
                disabled
                className="mt-1 px-6 py-2.5 rounded-xl bg-amber-400 text-white text-sm font-bold opacity-70 cursor-not-allowed"
              >
                升級會員
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-zinc-400">載入中...</div>}>
      <ExploreContent />
    </Suspense>
  );
}
