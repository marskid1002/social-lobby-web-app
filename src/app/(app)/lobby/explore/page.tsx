'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState, blockedPeerIds, escortPeerIds } from '@/lib/state';
import { OperatorHome } from '@/components/OperatorHome';
import { formatDistanceToNow, differenceInMinutes } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Lock, Crown, Users, UserCheck, Zap } from 'lucide-react';
import type { Request, User } from '@/lib/mock/types';
import { getRequestAccentColor, getRequestTypeLabel, SHOW_REQUEST_CLASSIFICATION } from '@/lib/utils';
import { RequestHeartSlots } from '@/components/RequestHeartSlots';
import { activeConfirmedGirlIds, confirmedGirlIdsForRequest } from '@/lib/request-attendance';
import { onlineEscortLimitForTier } from '@/lib/browse-access';

function shouldShowBoostNudge(req: Request): boolean {
  const impressions = req.metrics?.impressions ?? 0;
  const minutesOld = differenceInMinutes(new Date(), new Date(req.createdAt));
  return impressions < 5 && minutesOld >= 60;
}

function MyRequestCard({
  request,
  responders,
  atCap,
  interestedCount,
}: {
  request: Request;
  responders: User[];
  atCap: boolean;
  interestedCount: number;
}) {
  const router = useRouter();
  const showNudge = !atCap && shouldShowBoostNudge(request);
  const visibleResponders = responders.slice(0, 3);
  const extraCount = responders.length - visibleResponders.length;
  const accent = getRequestAccentColor(request.id);

  return (
    <div
      onClick={() => router.push(`/requests/${request.id}`)}
      className={`juga-request-card rounded-2xl shadow-sm overflow-hidden cursor-pointer transition-colors ${
        atCap ? 'opacity-75' : ''
      }`}
    >
      <div className={`p-4 ${atCap ? 'bg-zinc-50' : 'bg-white active:bg-brand-snow'}`}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            {SHOW_REQUEST_CLASSIFICATION && <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: accent + '44', color: '#020102' }}
            >
              {getRequestTypeLabel(request)}
            </span>}
            <span className="text-xs text-zinc-400">{request.area}</span>
            <span className="text-xs text-zinc-400">· {request.peopleCount} 人</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {atCap && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-500">
                額滿
              </span>
            )}
            <span className="text-[11px] text-zinc-400">
              {formatDistanceToNow(new Date(request.createdAt), { locale: zhTW, addSuffix: true })}
            </span>
          </div>
        </div>

        <p className="text-sm text-brand-ink leading-snug line-clamp-2 mb-3">{request.note}</p>

        <RequestHeartSlots
          total={request.peopleCount}
          confirmed={responders.length}
          className="mb-3"
        />

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
              {extraCount > 0
                ? `${visibleResponders.map(u => u.nickname.slice(0, 2)).join('、')} 等 ${visibleResponders.length + extraCount} 人已加入約會`
                : `${visibleResponders.map(u => u.nickname.slice(0, 2)).join('、')} 已加入約會`}
            </span>
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-zinc-400">
          {!atCap && (
            <span className="flex items-center gap-1">
              <UserCheck size={13} />
              <span className="font-semibold text-zinc-600">{interestedCount}</span> 人想加入
            </span>
          )}
          {atCap && (
            <span className="flex items-center gap-1 text-zinc-400">
              <Users size={13} />
              {responders.length}/{request.peopleCount} 人 · 點擊查看群組聊天
            </span>
          )}
          {showNudge && (
            <span className="ml-auto flex items-center gap-1 text-[11px] text-amber-600 font-semibold bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              <Zap size={11} />
              提升曝光
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function FemaleTile({ userId, blurred }: { userId: string; blurred?: boolean }) {
  const { state } = useAppState();
  const router = useRouter();
  const user = state.users.find((u) => u.id === userId);
  const onlineStatus = state.onlineStatuses.find((s) => s.userId === userId);
  const isBusy = activeConfirmedGirlIds(state.responses, state.invitations).has(userId);

  if (!user || !onlineStatus) return null;

  // 訪客超過可見數的人物磚：維持版面尺寸，但照片與資料馬賽克、不可點擊。
  if (blurred) {
    return (
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-100 shadow-sm select-none pointer-events-none">
        <div className="absolute inset-0 scale-110 blur-[8px]">
          <img
            src={user.avatarUrl}
            alt=""
            aria-hidden
            className="h-full w-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-black/10" />
        <div className="absolute inset-x-3 bottom-3">
          <div className="h-4 w-20 rounded bg-white/55 blur-[2px]" />
          <div className="mt-2 h-3 w-14 rounded bg-white/35 blur-[2px]" />
        </div>
        <span className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-xs text-white backdrop-blur-sm">🔒</span>
      </div>
    );
  }

  return (
    <button
      onClick={() => router.push(`/u/${userId}`)}
      className="group relative aspect-square w-full overflow-hidden rounded-2xl bg-zinc-100 text-left shadow-sm ring-1 ring-black/5 transition-transform active:scale-[0.98]"
      aria-label={`查看 ${user.nickname} 的個人頁`}
    >
      <img
        src={user.cardImageUrl || user.avatarUrl}
        alt={user.nickname}
        className="h-full w-full object-cover transition-transform duration-300 group-active:scale-[1.02]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-black/15" />

      <span className={`absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold text-white shadow-sm backdrop-blur-md ${
        isBusy ? 'bg-pink-500/85' : 'bg-emerald-500/85'
      }`}>
        <span className="h-1.5 w-1.5 rounded-full bg-white" />
        {isBusy ? '忙碌中' : '今晚在線'}
      </span>

      <div className="absolute inset-x-0 bottom-0 p-3 text-white">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight drop-shadow-sm">{user.nickname}</p>
            <p className="mt-1 truncate text-[11px] text-white/80">
              {onlineStatus.area} · {formatDistanceToNow(new Date(onlineStatus.lastSeen), { locale: zhTW, addSuffix: true })}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-white/20 px-2 py-1 text-[10px] font-semibold backdrop-blur-md">
            查看
          </span>
        </div>
      </div>
    </button>
  );
}

function ExploreContent() {
  const { state, currentUser } = useAppState();
  const router = useRouter();

  useEffect(() => {
    if (currentUser?.role === 'escort') router.replace('/requests');
  }, [currentUser?.role]);

  if (currentUser?.role === 'escort') return null;

  if (currentUser?.role === 'manager') {
    return <OperatorHome />;
  }

  const isVip = currentUser?.tier === 'vip';

  // Include open + closed (at-cap auto-closed) requests by this user
  const myRequests = state.requests
    .filter((r) => r.creatorId === currentUser?.id && (r.status === 'open' || r.status === 'closed'))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Split: at-cap = joiners >= peopleCount OR closed
  const withJoinerCount = myRequests.map((req) => {
    const confirmedGirlIds = confirmedGirlIdsForRequest(
      req.id,
      state.responses,
      state.invitations,
    );
    const joiners = confirmedGirlIds
      .map((userId) => state.users.find((u) => u.id === userId))
      .filter((u): u is User => !!u);
    const interested = state.responses.filter(
      (r) => r.requestId === req.id && r.responseStatus === 'interested'
    ).length;
    const atCap = req.status === 'closed'; // #5 派工無上限：僅已關閉才算結束
    return { req, joiners, interested, atCap };
  });

  const gathering = withJoinerCount.filter((x) => !x.atCap);
  const atCapList = withJoinerCount.filter((x) => x.atCap);
  const hasMyRequests = myRequests.length > 0;

  const blocked = blockedPeerIds(state); // 雙向封鎖：從瀏覽清單隱藏
  const escortIds = escortPeerIds(state); // 只顯示幹部自建的真實小姐，濾掉 demo 種子假人物
  const busyGirlIds = activeConfirmedGirlIds(state.responses, state.invitations);
  const femaleUserIds = state.onlineStatuses
    .filter((s) => {
      const u = state.users.find((u) => u.id === s.userId);
      return u && u.role === 'escort' && escortIds.has(u.id) && u.id !== currentUser?.id && !blocked.has(s.userId) && !busyGirlIds.has(s.userId);
    })
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
    .map((s) => s.userId);

  const tier = currentUser?.tier ?? 'free';
  const isGuest = tier === 'guest';
  const limit = onlineEscortLimitForTier(tier);
  const visibleFemaleIds = limit === Infinity ? femaleUserIds : femaleUserIds.slice(0, limit);
  // free：整段模糊；guest：全部顯示但超過 limit 的單張馬賽克；其餘：只顯示可見數
  const sectionBRenderIds = (tier === 'free' || isGuest) ? femaleUserIds : visibleFemaleIds;

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
            {/* Still gathering */}
            {gathering.map(({ req, joiners, interested }) => (
              <MyRequestCard key={req.id} request={req} responders={joiners} atCap={false} interestedCount={interested} />
            ))}

            {/* Divider — only shown when both groups have items */}
            {gathering.length > 0 && atCapList.length > 0 && (
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-zinc-200" />
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide shrink-0">已額滿</span>
                <div className="flex-1 h-px bg-zinc-200" />
              </div>
            )}
            {/* Only at-cap, no gathering — show header inline */}
            {gathering.length === 0 && atCapList.length > 0 && (
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">已額滿</p>
            )}

            {/* At-cap */}
            {atCapList.map(({ req, joiners }) => (
              <MyRequestCard key={req.id} request={req} responders={joiners} atCap={true} interestedCount={0} />
            ))}
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
        <div className={`grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 ${tier === 'free' ? 'filter blur-[5px] pointer-events-none select-none' : ''}`}>
          {sectionBRenderIds.map((uid, idx) => (
            <FemaleTile key={uid} userId={uid} blurred={isGuest && idx >= limit} />
          ))}
        </div>

        {currentUser?.tier === 'free' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px]">
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

        {/* 升級擴展 CTA 暫時隱藏（付費功能尚未開放）*/}
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
