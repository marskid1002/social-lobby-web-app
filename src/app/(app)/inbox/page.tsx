'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { MessageCircle, TrendingUp, MessageSquare, UserCheck, CheckCircle } from 'lucide-react';

function getThreadId(a: string, b: string) {
  return [a, b].sort().join('-');
}

const MATCH_GRADIENT = 'linear-gradient(135deg, #8BD8F1 0%, #DED9E5 50%, #F7BEF1 100%)';

export default function InboxPage() {
  const { state, currentUser, clearInboxUnread, markUpdatesRead, confirmMeetup } = useAppState();
  const router = useRouter();

  const role = currentUser?.role;
  const isEscort = role === 'escort';

  useEffect(() => {
    if (state.inboxUnread) clearInboxUnread();
    const unreadIds = state.updates
      .filter((u) => u.userId === state.currentUserId && !state.readUpdateIds.includes(u.id))
      .map((u) => u.id);
    if (unreadIds.length > 0) markUpdatesRead(unreadIds);
  }, []);

  // ── Match cards ──────────────────────────────────────────────────────────────

  // User side: any accepted invitation sent TO me (private) OR sent FROM escort to me (request-based)
  const userMatchCards = !isEscort
    ? state.invitations.filter(
        (i) =>
          i.status === 'accepted' &&
          !i.meetupConfirmed &&
          (i.toUserId === state.currentUserId || i.fromUserId === state.currentUserId) &&
          // For request-based: escort joined MY request; for private: I sent invite
          (i.requestId !== null
            ? i.toUserId === state.currentUserId  // escort joined → toUserId = me (requester)
            : i.fromUserId === state.currentUserId) // private invite I sent → accepted
      )
    : [];

  // Escort side: invitations I sent (by joining requests) that are accepted and not confirmed
  const escortMatchCards = isEscort
    ? state.invitations.filter(
        (i) =>
          i.status === 'accepted' &&
          !i.meetupConfirmed &&
          i.fromUserId === state.currentUserId
      )
    : [];

  const matchCards = isEscort ? escortMatchCards : userMatchCards;

  // ── Notification feed (users only) ──────────────────────────────────────────
  const myRequestIds = new Set(
    state.requests.filter((r) => r.creatorId === state.currentUserId).map((r) => r.id)
  );

  const joinNotifs = !isEscort
    ? state.responses
        .filter((r) => r.responseStatus === 'joining' && myRequestIds.has(r.requestId))
        .filter((r) => !matchCards.some((mc) => {
          // Don't double-show if already in a match card
          const inv = state.invitations.find(i => i.requestId === r.requestId && i.fromUserId === r.userId);
          return !!inv;
        }))
        .map((r) => ({
          id: `join-${r.id}`,
          type: 'join' as const,
          actorId: r.userId,
          refRequestId: r.requestId,
          createdAt: r.createdAt,
        }))
    : [];

  const eventNotifs = !isEscort
    ? state.updates
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
        }))
    : [];

  const allNotifs = [...joinNotifs, ...eventNotifs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const isEmpty = matchCards.length === 0 && allNotifs.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mb-4 shadow-card"
          style={{ background: MATCH_GRADIENT }}
        >
          <span className="text-4xl">{isEscort ? '🌟' : '🔔'}</span>
        </div>
        <p className="text-base font-semibold text-brand-ink mb-1">
          {isEscort ? '還沒有加入任何活動' : '目前沒有通知'}
        </p>
        <p className="text-sm text-zinc-400 leading-snug">
          {isEscort ? '前往活動列表，加入你喜歡的局' : '發布邀請後，通知會在這裡顯示'}
        </p>
        {isEscort && (
          <button
            onClick={() => router.push('/requests')}
            className="mt-4 px-6 py-2.5 rounded-2xl font-semibold text-sm text-brand-ink active:scale-95 transition-all shadow-card"
            style={{ background: MATCH_GRADIENT }}
          >
            查看今晚的局
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 py-4 flex flex-col gap-4">

      {/* ── Match cards ── */}
      {matchCards.map((inv) => {
        const otherId = inv.fromUserId === state.currentUserId ? inv.toUserId : inv.fromUserId;
        const other = state.users.find((u) => u.id === otherId);
        const threadId = getThreadId(state.currentUserId, otherId);
        const request = inv.requestId ? state.requests.find((r) => r.id === inv.requestId) : null;

        function handleConfirm() {
          confirmMeetup(inv.id, otherId);
        }

        return (
          <div
            key={inv.id}
            className="relative rounded-3xl overflow-hidden shadow-card"
            style={{ background: MATCH_GRADIENT }}
          >
            <div className="absolute inset-0 bg-white/20 rounded-3xl" />
            <div className="relative p-4">
              <div className="flex items-center gap-3 mb-3">
                {other && (
                  <div className="relative">
                    <img
                      src={other.avatarUrl}
                      alt={other.nickname}
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-white shadow-md"
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 text-base leading-none">✨</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-brand-ink">
                    {isEscort
                      ? `你加入了 ${other?.nickname} 的活動`
                      : `${other?.nickname} 加入了你的邀請！`}
                  </p>
                  {request && (
                    <p className="text-xs text-brand-ink/60 mt-0.5 truncate">
                      {request.area} · {request.note.slice(0, 24)}…
                    </p>
                  )}
                  <p className="text-xs text-brand-ink/50 mt-0.5">聊天視窗已開啟 · 8 小時後關閉</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/chat/${threadId}`)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-white/70 backdrop-blur text-brand-ink font-bold text-sm active:scale-[0.98] transition-all shadow-sm"
                >
                  <MessageCircle className="w-4 h-4" strokeWidth={2} />
                  聊天
                </button>
                {isEscort && (
                  <button
                    onClick={handleConfirm}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-brand-ink/80 text-white font-bold text-sm active:scale-[0.98] transition-all"
                  >
                    <CheckCircle className="w-4 h-4" strokeWidth={2} />
                    確認見面
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* ── Notification feed (users only) ── */}
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
                  {request && <span className="text-zinc-400"> · {request.area}</span>}
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
                {notif.type === 'join' && actor ? (
                  <img src={actor.avatarUrl} alt={actor.nickname} className="w-9 h-9 rounded-full object-cover shrink-0" />
                ) : (
                  icon
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-brand-ink leading-snug">{text}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {formatDistanceToNow(new Date(notif.createdAt), { locale: zhTW, addSuffix: true })}
                  </p>
                </div>
                {notif.type !== 'join' && actor && (
                  <img src={actor.avatarUrl} alt={actor.nickname ?? ''} className="w-7 h-7 rounded-full object-cover shrink-0 opacity-70" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
