'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { MessageCircle, TrendingUp, MessageSquare, UserCheck, CheckCircle, Users } from 'lucide-react';
import { getRequestGradient, REQUEST_TYPE_LABELS } from '@/lib/utils';

function getThreadId(a: string, b: string) {
  return [a, b].sort().join('-');
}

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

  // ── Match cards — one per request ───────────────────────────────────────────

  // Collect all accepted, unconfirmed invitations where current user is a chat participant
  // （涵蓋：客戶=toUserId、代談幹部/女伴=fromUserId、私人邀請雙方）
  const relevantInvites = state.invitations.filter((i) => {
    if (i.status !== 'accepted' || i.meetupConfirmed) return false;
    return i.fromUserId === state.currentUserId || i.toUserId === state.currentUserId;
  });

  // Deduplicate by requestId — one card per request (private invites keep their own card)
  const seenRequestIds = new Set<string>();
  const matchCards: Array<{
    key: string;
    requestId: string | null;
    threadId: string;
    isGroup: boolean;
    joinerUsers: typeof state.users;
    otherUserId: string;
    gradient: string;
    chatExpiresAt?: string;
    inviteId: string; // for 1:1 confirmMeetup
  }> = [];

  for (const inv of relevantInvites) {
    if (inv.requestId !== null) {
      // 對話另一方 = invitation 中不是自己的那位
      const otherUserId = inv.fromUserId === state.currentUserId ? inv.toUserId : inv.fromUserId;
      // 以「局 + 對話對象」去重：同一局若有多位代談對象（多位派工被接受），各自保留一張卡與聊天入口，
      // 不要只用 requestId 去重（會把第二位之後的聊天整個藏起來 → 找不到聊天）。
      const dedupeKey = `${inv.requestId}::${otherUserId}`;
      if (seenRequestIds.has(dedupeKey)) continue;
      seenRequestIds.add(dedupeKey);

      // isGroup 僅以 invitation.groupThreadId 判定（幹部代談一律 1:1）
      const isGroup = !!inv.groupThreadId;
      const threadId = isGroup ? inv.groupThreadId! : getThreadId(state.currentUserId, otherUserId);

      // All joiners for this request
      const joinerIds = state.responses
        .filter((r) => r.requestId === inv.requestId && r.responseStatus === 'joining')
        .map((r) => r.userId);
      const joinerUsers = joinerIds
        .map((id) => state.users.find((u) => u.id === id))
        .filter(Boolean) as typeof state.users;

      matchCards.push({
        key: inv.id,
        requestId: inv.requestId,
        threadId,
        isGroup,
        joinerUsers,
        otherUserId,
        gradient: getRequestGradient(inv.requestId),
        chatExpiresAt: inv.chatExpiresAt,
        inviteId: inv.id,
      });
    } else {
      // Private invite — always 1:1
      const otherId = inv.fromUserId === state.currentUserId ? inv.toUserId : inv.fromUserId;
      matchCards.push({
        key: inv.id,
        requestId: null,
        threadId: getThreadId(state.currentUserId, otherId),
        isGroup: false,
        joinerUsers: [],
        otherUserId: otherId,
        gradient: 'linear-gradient(135deg, #8BD8F1 0%, #DED9E5 50%, #F7BEF1 100%)',
        chatExpiresAt: inv.chatExpiresAt,
        inviteId: inv.id,
      });
    }
  }

  // ── Notification feed ───────────────────────────────────────────────────────
  const myRequestIds = new Set(
    state.requests.filter((r) => r.creatorId === state.currentUserId).map((r) => r.id)
  );

  const interestedNotifs = !isEscort
    ? state.responses
        .filter((r) => r.responseStatus === 'interested' && myRequestIds.has(r.requestId))
        .map((r) => ({
          id: `interested-${r.id}`,
          type: 'interested' as const,
          actorId: r.userId,
          refRequestId: r.requestId,
          createdAt: r.createdAt,
        }))
    : [];

  const joinNotifs = !isEscort
    ? state.responses
        .filter((r) => r.responseStatus === 'joining' && myRequestIds.has(r.requestId))
        .filter((r) => !matchCards.some((mc) => mc.requestId === r.requestId))
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

  const allNotifs = [...interestedNotifs, ...joinNotifs, ...eventNotifs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const isEmpty = matchCards.length === 0 && allNotifs.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mb-4 shadow-card"
          style={{ background: 'linear-gradient(135deg, #8BD8F1 0%, #DED9E5 50%, #F7BEF1 100%)' }}
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
            style={{ background: 'linear-gradient(135deg, #8BD8F1 0%, #DED9E5 50%, #F7BEF1 100%)' }}
          >
            查看今晚的局
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 py-4 flex flex-col gap-4">

      {/* ── Match cards — one per request ── */}
      {matchCards.map((card) => {
        const request = card.requestId ? state.requests.find((r) => r.id === card.requestId) : null;
        const otherUser = state.users.find((u) => u.id === card.otherUserId);
        const creatorUser = request ? state.users.find((u) => u.id === request.creatorId) : null;

        function handleConfirm() {
          confirmMeetup(card.inviteId, card.otherUserId);
        }

        return (
          <div
            key={card.key}
            className="relative rounded-3xl overflow-hidden shadow-card"
            style={{ background: card.gradient }}
          >
            <div className="absolute inset-0 bg-white/20 rounded-3xl" />
            <div className="relative p-4">
              <div className="flex items-center gap-3 mb-3">
                {/* Avatar(s) */}
                {card.isGroup ? (
                  <div className="relative w-12 h-10 shrink-0">
                    {card.joinerUsers.slice(0, 3).map((u, idx) => (
                      <img
                        key={u.id}
                        src={u.avatarUrl}
                        alt={u.nickname}
                        className="absolute w-8 h-8 rounded-full object-cover ring-2 ring-white"
                        style={{ left: idx * 9, top: idx % 2 === 0 ? 0 : 4, zIndex: 3 - idx }}
                      />
                    ))}
                  </div>
                ) : (
                  otherUser && (
                    <div className="relative shrink-0">
                      <img
                        src={otherUser.avatarUrl}
                        alt={otherUser.nickname}
                        className="w-12 h-12 rounded-full object-cover ring-2 ring-white shadow-md"
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 text-base leading-none">✨</span>
                    </div>
                  )
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-brand-ink">
                    {request
                      ? `${REQUEST_TYPE_LABELS[request.requestType] ?? request.requestType} · ${creatorUser?.nickname ?? '某人'}`
                      : isEscort
                        ? `你加入了 ${creatorUser?.nickname ?? '某人'} 的活動`
                        : `${otherUser?.nickname} 的私人邀請`}
                  </p>
                  {request && (
                    <p className="text-xs text-brand-ink/60 mt-0.5 truncate">
                      {request.area} · {request.note.slice(0, 28)}…
                    </p>
                  )}
                  <p className="text-xs text-brand-ink/50 mt-0.5">
                    {card.isGroup
                      ? `${card.joinerUsers.length} 位女伴加入 · 群組聊天已開啟`
                      : (() => {
                          const ms = card.chatExpiresAt ? new Date(card.chatExpiresAt).getTime() - Date.now() : 0;
                          if (ms <= 0) return '聊天視窗已關閉';
                          const days = Math.floor(ms / 86400000);
                          const hrs = Math.floor((ms % 86400000) / 3600000);
                          return days > 0 ? `聊天視窗開啟中 · 還有 ${days} 天` : `聊天視窗開啟中 · 還有 ${hrs} 小時`;
                        })()}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/chat/${card.threadId}`)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-white/70 backdrop-blur text-brand-ink font-bold text-sm active:scale-[0.98] transition-all shadow-sm"
                >
                  <MessageCircle className="w-4 h-4" strokeWidth={2} />
                  {card.isGroup ? '群組聊天' : '聊天'}
                </button>
                {isEscort && !card.isGroup && (
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

      {/* ── Notification feed — each notif is its own card ── */}
      {allNotifs.length > 0 && (
        <div className="flex flex-col gap-2">
          {allNotifs.map((notif) => {
            const actor = state.users.find((u) => u.id === notif.actorId);
            const request = notif.refRequestId
              ? state.requests.find((r) => r.id === notif.refRequestId)
              : null;
            const notifAccent = notif.refRequestId ? getRequestGradient(notif.refRequestId) : undefined;

            let icon: React.ReactNode;
            let text: React.ReactNode;
            let onTap: () => void;
            let chipLabel: string | null = null;

            if (notif.type === 'interested') {
              icon = (
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-amber-500" strokeWidth={2} />
                </div>
              );
              chipLabel = request ? (REQUEST_TYPE_LABELS[request.requestType] ?? request.requestType) : null;
              text = (
                <>
                  <span className="font-semibold">{actor?.nickname ?? '某人'}</span>
                  {' 想加入你的局'}
                  {request && <span className="text-zinc-400"> · {request.area}</span>}
                </>
              );
              onTap = () => notif.refRequestId && router.push(`/requests/${notif.refRequestId}`);
            } else if (notif.type === 'join') {
              icon = (
                <div className="w-9 h-9 rounded-full bg-brand-sky/20 flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4 text-brand-sky" strokeWidth={2} />
                </div>
              );
              chipLabel = request ? (REQUEST_TYPE_LABELS[request.requestType] ?? request.requestType) : null;
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
              chipLabel = request ? (REQUEST_TYPE_LABELS[request.requestType] ?? request.requestType) : null;
              text = (
                <>
                  {'你的邀請達到 '}
                  <span className="font-semibold text-amber-600">{(notif as { milestoneCount?: number }).milestoneCount} 次</span>
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
              onTap = () => (notif as { refPostId?: string }).refPostId && router.push(`/plaza/${(notif as { refPostId?: string }).refPostId}`);
            }

            return (
              <button
                key={notif.id}
                onClick={onTap}
                className="w-full bg-white rounded-2xl border border-brand-lavender shadow-card overflow-hidden text-left active:bg-brand-ice transition-colors"
              >
                {/* Colored top strip tied to the specific request */}
                {notifAccent && (
                  <div className="h-1.5 w-full" style={{ background: notifAccent }} />
                )}
                <div className="flex items-center gap-3 px-4 py-3.5">
                  {(notif.type === 'join' || notif.type === 'interested') && actor ? (
                    <img src={actor.avatarUrl} alt={actor.nickname} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    icon
                  )}
                  <div className="flex-1 min-w-0">
                    {chipLabel && (
                      <span
                        className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-1"
                        style={{ background: notifAccent ? notifAccent.replace('linear-gradient', 'linear-gradient').replace('135deg', '135deg') : '#e5e7eb', color: '#020102' }}
                      >
                        {chipLabel}
                      </span>
                    )}
                    <p className="text-sm text-brand-ink leading-snug">{text}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {formatDistanceToNow(new Date(notif.createdAt), { locale: zhTW, addSuffix: true })}
                    </p>
                  </div>
                  {notif.type === 'interested' && (
                    <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-600">
                      待回應
                    </span>
                  )}
                  {notif.type !== 'join' && notif.type !== 'interested' && actor && (
                    <img src={actor.avatarUrl} alt={actor.nickname ?? ''} className="w-7 h-7 rounded-full object-cover shrink-0 opacity-70" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
