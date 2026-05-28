'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { MessageCircle, TrendingUp, UserCheck, MessageSquare } from 'lucide-react';

function getThreadId(a: string, b: string) {
  return [a, b].sort().join('-');
}

export default function InboxPage() {
  const { state, currentUser, clearInboxUnread, markUpdatesRead } = useAppState();
  const router = useRouter();

  // Mark all as read when opened
  useEffect(() => {
    if (state.inboxUnread) clearInboxUnread();
    const unreadIds = state.updates
      .filter((u) => u.userId === state.currentUserId && !state.readUpdateIds.includes(u.id))
      .map((u) => u.id);
    if (unreadIds.length > 0) markUpdatesRead(unreadIds);
  }, []);

  // ── Match cards: accepted private invitations ──
  const matchCards = state.invitations.filter(
    (i) =>
      i.requestId === null &&
      i.status === 'accepted' &&
      !i.meetupConfirmed &&
      (i.fromUserId === state.currentUserId || i.toUserId === state.currentUserId)
  );

  // ── Notification feed ──
  // Only: response_received (joining), milestone_views, plaza_reply
  const myRequestIds = new Set(
    state.requests.filter((r) => r.creatorId === state.currentUserId).map((r) => r.id)
  );

  // Get joining responses on my requests (derive from responses, not events, for live accuracy)
  const joinNotifs = state.responses
    .filter((r) => {
      if (r.responseStatus !== 'joining') return false;
      return myRequestIds.has(r.requestId);
    })
    .map((r) => ({
      id: `join-${r.id}`,
      type: 'join' as const,
      actorId: r.userId,
      refRequestId: r.requestId,
      createdAt: r.createdAt,
    }));

  // Milestone and plaza_reply events from updates feed
  const eventNotifs = state.updates
    .filter(
      (u) =>
        u.userId === state.currentUserId &&
        (u.eventType === 'milestone_views' || u.eventType === 'plaza_reply')
    )
    .map((u) => ({
      id: u.id,
      type: u.eventType as 'milestone_views' | 'plaza_reply',
      actorId: u.actorId,
      refRequestId: u.refRequestId,
      refPostId: u.refPostId,
      milestoneCount: u.milestoneCount,
      createdAt: u.createdAt,
    }));

  const allNotifs = [...joinNotifs, ...eventNotifs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const isEmpty = matchCards.length === 0 && allNotifs.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#8BD8F1] to-[#F7BEF1] flex items-center justify-center mb-4 shadow-card">
          <span className="text-4xl">🔔</span>
        </div>
        <p className="text-base font-semibold text-brand-ink mb-1">目前沒有通知</p>
        <p className="text-sm text-zinc-400 leading-snug">
          發布邀請後，這裡會顯示加入通知與曝光里程碑
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 flex flex-col gap-4">

      {/* ── Match cards (sky→pink gradient) ── */}
      {matchCards.map((inv) => {
        const otherId = inv.fromUserId === state.currentUserId ? inv.toUserId : inv.fromUserId;
        const other = state.users.find((u) => u.id === otherId);
        const threadId = getThreadId(state.currentUserId, otherId);

        return (
          <div
            key={inv.id}
            className="relative rounded-3xl overflow-hidden shadow-card"
            style={{ background: 'linear-gradient(135deg, #8BD8F1 0%, #DED9E5 50%, #F7BEF1 100%)' }}
          >
            {/* subtle inner glow */}
            <div className="absolute inset-0 bg-white/20 rounded-3xl" />
            <div className="relative p-4">
              <div className="flex items-center gap-3 mb-3">
                {other && (
                  <div className="relative">
                    <img
                      src={other.avatarUrl}
                      alt={other.nickname}
                      className="w-12 h-12 rounded-full object-cover ring-3 ring-white shadow-md"
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 text-base leading-none">✨</span>
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold text-brand-ink">
                    {other?.nickname} 接受了你的邀請！
                  </p>
                  <p className="text-xs text-brand-ink/60 mt-0.5">
                    聊天視窗已開啟 · 8 小時後關閉
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push(`/chat/${threadId}`)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-white/70 backdrop-blur text-brand-ink font-bold text-sm active:scale-[0.98] transition-all shadow-sm"
              >
                <MessageCircle className="w-4 h-4" strokeWidth={2} />
                開始聊天
              </button>
            </div>
          </div>
        );
      })}

      {/* ── Notification feed ── */}
      {allNotifs.length > 0 && (
        <div className="bg-white rounded-2xl border border-brand-lavender shadow-card overflow-hidden">
          {allNotifs.map((notif, i) => {
            const actor = state.users.find((u) => u.id === notif.actorId);
            const request = notif.refRequestId
              ? state.requests.find((r) => r.id === notif.refRequestId)
              : null;

            let icon: React.ReactNode;
            let text: React.ReactNode;
            let onTap: () => void;

            if (notif.type === 'join') {
              icon = (
                <div className="w-9 h-9 rounded-full bg-brand-sky/20 flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4 text-brand-sky" strokeWidth={2} />
                </div>
              );
              text = (
                <>
                  <span className="font-semibold">{actor?.nickname ?? '某人'}</span>
                  {' 加入了你的邀請'}
                  {request && (
                    <span className="text-zinc-400">
                      {' ·'} {request.area}
                    </span>
                  )}
                </>
              );
              onTap = () => notif.refRequestId && router.push(`/requests/${notif.refRequestId}`);
            } else if (notif.type === 'milestone_views') {
              icon = (
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4 text-amber-500" strokeWidth={2} />
                </div>
              );
              text = (
                <>
                  {'你的邀請達到 '}
                  <span className="font-semibold text-amber-600">{notif.milestoneCount} 次</span>
                  {' 查看！'}
                </>
              );
              onTap = () => notif.refRequestId && router.push(`/requests/${notif.refRequestId}`);
            } else {
              // plaza_reply
              icon = (
                <div className="w-9 h-9 rounded-full bg-brand-pink/30 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4 text-pink-500" strokeWidth={2} />
                </div>
              );
              text = (
                <>
                  <span className="font-semibold">{actor?.nickname ?? '某人'}</span>
                  {' 回覆了你在廣場的留言'}
                </>
              );
              onTap = () => notif.refPostId && router.push(`/plaza/${notif.refPostId}`);
            }

            return (
              <button
                key={notif.id}
                onClick={onTap}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-brand-ice transition-colors ${
                  i > 0 ? 'border-t border-brand-lavender' : ''
                }`}
              >
                {/* Actor avatar or icon */}
                {notif.type === 'join' && actor ? (
                  <img
                    src={actor.avatarUrl}
                    alt={actor.nickname}
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                  />
                ) : (
                  icon
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-brand-ink leading-snug">{text}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {formatDistanceToNow(new Date(notif.createdAt), { locale: zhTW, addSuffix: true })}
                  </p>
                </div>

                {/* For join, show actor avatar icon; for others show the icon */}
                {notif.type !== 'join' && actor && (
                  <img
                    src={actor.avatarUrl}
                    alt={actor?.nickname ?? ''}
                    className="w-7 h-7 rounded-full object-cover shrink-0 opacity-70"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
