'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns';
import { zhTW } from 'date-fns/locale';

const EVENT_LABELS: Record<string, (actor: string) => string> = {
  invite_received: (a) => `${a} 邀請你加入需求`,
  response_received: (a) => `${a} 對你的需求表示興趣`,
  follow: (a) => `${a} 開始關注你`,
  status_change: (a) => `${a} 上線了`,
  request_closed: (a) => `${a} 關閉了你參與的需求`,
};

function groupByDay(updates: { createdAt: string }[]) {
  const groups: Record<string, typeof updates> = {};
  for (const u of updates) {
    const d = new Date(u.createdAt);
    const key = isToday(d) ? '今天' : isYesterday(d) ? '昨天' : format(d, 'M 月 d 日', { locale: zhTW });
    if (!groups[key]) groups[key] = [];
    groups[key].push(u);
  }
  return groups;
}

export default function UpdatesPage() {
  const { state, markUpdatesRead } = useAppState();
  const router = useRouter();

  const myUpdates = state.updates.filter((u) => u.userId === state.currentUserId);

  useEffect(() => {
    const unreadIds = myUpdates.filter((u) => !state.readUpdateIds.includes(u.id)).map((u) => u.id);
    if (unreadIds.length > 0) markUpdatesRead(unreadIds);
  }, []);

  const groups = groupByDay(myUpdates);

  if (myUpdates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-card-c flex items-center justify-center mb-4 shadow-card">
          <span className="text-4xl">🔔</span>
        </div>
        <p className="text-base font-semibold text-brand-ink mb-1">目前沒有動態</p>
        <p className="text-sm text-zinc-400">等有人邀請你、回應你或關注你就會出現</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 flex flex-col gap-4">
      {Object.entries(groups).map(([day, items]) => (
        <section key={day}>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">{day}</p>
          <div className="flex flex-col gap-2">
            {items.map((update: any) => {
              const actor = state.users.find((u) => u.id === update.actorId);
              const isUnread = !state.readUpdateIds.includes(update.id);
              const label = EVENT_LABELS[update.eventType]?.(actor?.nickname ?? '?') ?? '有新動態';
              const req = update.refRequestId
                ? state.requests.find((r) => r.id === update.refRequestId)
                : null;

              function handleTap() {
                if (update.refRequestId) {
                  router.push(`/requests/${update.refRequestId}`);
                } else if (update.eventType === 'follow' || update.eventType === 'status_change') {
                  router.push(`/u/${update.actorId}`);
                }
              }

              return (
                <button
                  key={update.id}
                  onClick={handleTap}
                  className={`w-full flex items-start gap-3 p-3 rounded-2xl text-left transition-colors ${
                    isUnread
                      ? 'bg-brand-sky/10 border-l-4 border-brand-sky'
                      : 'bg-white border border-brand-lavender'
                  } shadow-card`}
                >
                  {actor && (
                    <img src={actor.avatarUrl} alt={actor.nickname} className="w-10 h-10 rounded-full object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand-ink">{label}</p>
                    {req && (
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {req.requestType === 'after_party' ? 'After Party' : req.requestType} · {req.area}
                      </p>
                    )}
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {formatDistanceToNow(new Date(update.createdAt), { locale: zhTW, addSuffix: true })}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
