'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { OperatorHome } from '@/components/OperatorHome';
import { formatDistanceToNow, differenceInMinutes } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Lock, Crown, Users, Eye, UserCheck, Zap } from 'lucide-react';
import type { Request, User } from '@/lib/mock/types';

const REQUEST_TYPE_LABELS: Record<string, string> = {
  after_party: '派對後',
  drinking: '酒局',
  fill_spot: '補位',
  last_minute: '臨時約',
  other: '其他',
};

const STATUS_LABELS: Record<string, string> = {
  available: '有空',
  bring_people: '可同行',
  fill_spot: '臨時有空',
  busy: '忙碌中',
};

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-100 text-green-700',
  bring_people: 'bg-blue-100 text-blue-700',
  fill_spot: 'bg-yellow-100 text-yellow-700',
  busy: 'bg-zinc-100 text-zinc-500',
};

const SECTION_B_LIMIT: Record<string, number> = {
  free: 0,
  standard: 3,
  premium: 10,
  vip: Infinity,
};

function shouldShowBoostNudge(req: Request): boolean {
  const impressions = req.metrics?.impressions ?? 0;
  const minutesOld = differenceInMinutes(new Date(), new Date(req.createdAt));
  return impressions < 5 && minutesOld >= 60;
}

function MyRequestCard({ request, responders }: { request: Request; responders: User[] }) {
  const router = useRouter();
  const showNudge = shouldShowBoostNudge(request);
  const metrics = request.metrics ?? { impressions: 0, views: 0, joins: 0 };
  const visibleResponders = responders.slice(0, 3);
  const extraCount = responders.length - visibleResponders.length;

  return (
    <div
      onClick={() => router.push(`/requests/${request.id}`)}
      className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-4 cursor-pointer active:bg-brand-snow transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-brand-sky bg-brand-ice px-2 py-0.5 rounded-full">
            {REQUEST_TYPE_LABELS[request.requestType] ?? request.requestType}
          </span>
          <span className="text-xs text-zinc-400">{request.area}</span>
          <span className="text-xs text-zinc-400">· {request.peopleCount} 人</span>
        </div>
        <span className="text-[11px] text-zinc-400 shrink-0">
          {formatDistanceToNow(new Date(request.createdAt), { locale: zhTW, addSuffix: true })}
        </span>
      </div>

      <p className="text-sm text-brand-ink leading-snug line-clamp-2 mb-3">{request.note}</p>

      {visibleResponders.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex -space-x-2">
            {visibleResponders.map((u) => (
              <img
                key={u.id}
                src={u.avatarUrl}
                alt={u.nickname}
                className="w-6 h-6 rounded-full border-2 border-white object-cover"
              />
            ))}
          </div>
          <span className="text-xs text-zinc-500">
            {extraCount > 0 ? `${metrics.joins} 人想加入` : `${visibleResponders.map(u => u.nickname.split('')[0]).join('、')} 等人有興趣`}
          </span>
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1">
          <Eye size={13} />
          <span className="font-semibold text-zinc-600">{metrics.impressions}</span> 曝光
        </span>
        <span className="flex items-center gap-1">
          <Users size={13} />
          <span className="font-semibold text-zinc-600">{metrics.views}</span> 查看
        </span>
        <span className="flex items-center gap-1">
          <UserCheck size={13} />
          <span className="font-semibold text-zinc-600">{metrics.joins}</span> 想加入
        </span>

        {showNudge && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-amber-600 font-semibold bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
            <Zap size={11} />
            提升曝光
          </span>
        )}
      </div>
    </div>
  );
}

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

  if (currentUser?.role === 'operator') {
    return <OperatorHome />;
  }

  const isVip = currentUser?.tier === 'vip';

  const myRequests = state.requests
    .filter((r) => r.creatorId === currentUser?.id && r.status === 'open')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const femaleUserIds = state.onlineStatuses
    .filter((s) => {
      const u = state.users.find((u) => u.id === s.userId);
      return u && u.role === 'user' && u.id !== currentUser?.id;
    })
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
    .map((s) => s.userId);

  const limit = SECTION_B_LIMIT[currentUser?.tier ?? 'free'] ?? 0;
  const visibleFemaleIds = limit === Infinity ? femaleUserIds : femaleUserIds.slice(0, limit);
  const hasMoreFemales = femaleUserIds.length > visibleFemaleIds.length;
  const hasMyRequests = myRequests.length > 0;

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: 'calc(100dvh - 57px)' }}
    >
      {/* === SECTION A: My Requests === */}
      <div className={hasMyRequests ? 'flex-1 min-h-0 overflow-y-auto' : 'shrink-0'}>
        <div className="px-4 pt-4 pb-2">
          <p className="text-sm font-bold text-brand-ink uppercase tracking-wider">我的邀請</p>
        </div>

        {hasMyRequests ? (
          <div className="px-4 pb-4 flex flex-col gap-3">
            {myRequests.map((req) => {
              const responders = state.responses
                .filter((r) => r.requestId === req.id)
                .map((r) => state.users.find((u) => u.id === r.userId))
                .filter((u): u is User => !!u);
              return <MyRequestCard key={req.id} request={req} responders={responders} />;
            })}
          </div>
        ) : (
          <div className="px-4 pb-4">
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/60 p-6 flex flex-col items-center text-center gap-1.5">
              <p className="text-sm font-semibold text-brand-ink">今晚想做什麼？</p>
              <p className="text-xs text-zinc-400 leading-snug">發出邀請，讓今晚在線的人看到你</p>
            </div>
          </div>
        )}
      </div>

      {/* Section B divider */}
      <div className="flex items-center gap-3 px-4 py-3 bg-brand-snow border-y border-zinc-100 shrink-0">
        {isVip ? (
          <Crown size={14} className="text-amber-500 shrink-0" />
        ) : currentUser?.tier === 'free' ? (
          <Lock size={14} className="text-zinc-400 shrink-0" />
        ) : (
          <Users size={14} className="text-zinc-400 shrink-0" />
        )}
        <p className="text-sm font-bold text-brand-ink uppercase tracking-wider">今晚在線</p>
      </div>

      {/* === SECTION B: Online Women === */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-24 relative">
        <div className={currentUser?.tier === 'free' ? 'filter blur-[6px] pointer-events-none select-none' : ''}>
          {visibleFemaleIds.map((uid) => (
            <FemaleListRow key={uid} userId={uid} />
          ))}
        </div>

        {currentUser?.tier === 'free' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <span className="text-3xl">🔒</span>
              <p className="text-base font-bold text-brand-ink">探索更多，認識更多</p>
              <p className="text-sm text-zinc-500">升級會員，認識今晚在線的用戶</p>
              <button
                disabled
                className="mt-1 px-6 py-2.5 rounded-xl bg-amber-400 text-white text-sm font-bold opacity-70 cursor-not-allowed"
              >
                了解會員方案
              </button>
            </div>
          </div>
        )}

        {hasMoreFemales && !isVip && currentUser?.tier !== 'free' && (
          <div className="px-4 py-5 text-center border-t border-zinc-100">
            <p className="text-sm text-zinc-500 mb-3">還有更多今晚在線的用戶</p>
            <button
              disabled
              className="px-5 py-2.5 rounded-xl bg-brand-snow border border-brand-lavender text-sm font-semibold text-zinc-400 cursor-not-allowed"
            >
              升級擴展你的社交圈
            </button>
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
