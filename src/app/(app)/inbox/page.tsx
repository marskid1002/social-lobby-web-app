'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { RequestCard } from '@/components/RequestCard';
import { PostRequestSheet } from '@/components/PostRequestSheet';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { MessageCircle } from 'lucide-react';
import { useState } from 'react';

function getThreadId(a: string, b: string) {
  return [a, b].sort().join('-');
}

export default function InboxPage() {
  const { state, clearInboxUnread } = useAppState();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Clear inbox unread badge when user opens inbox
  useEffect(() => {
    if (state.inboxUnread) clearInboxUnread();
  }, []);

  const myRequests = state.requests.filter(
    (r) => r.creatorId === state.currentUserId && r.status === 'open'
  );

  const responsesReceived = state.responses.filter((resp) =>
    myRequests.some((req) => req.id === resp.requestId)
  );

  // Accepted invitations (private) — show "start chatting"
  const acceptedInvites = state.invitations.filter(
    (i) =>
      i.requestId === null &&
      i.status === 'accepted' &&
      !i.meetupConfirmed &&
      (i.fromUserId === state.currentUserId || i.toUserId === state.currentUserId)
  );

  // Teaser messages from girls (read-only)
  const teasers = (state.teaserMessages ?? []).filter((t) => t.toUserId === state.currentUserId);

  const isEmpty =
    myRequests.length === 0 &&
    acceptedInvites.length === 0 &&
    responsesReceived.length === 0 &&
    teasers.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-card-a flex items-center justify-center mb-4 shadow-card">
          <span className="text-4xl">📭</span>
        </div>
        <p className="text-base font-semibold text-brand-ink mb-1">收件匣是空的</p>
        <p className="text-sm text-zinc-400 mb-5">發布你的第一個需求，讓大家找到你</p>
        <button
          onClick={() => setSheetOpen(true)}
          className="px-6 py-2.5 rounded-2xl bg-brand-sky text-brand-ink font-semibold text-sm active:scale-95 transition-transform shadow-card"
        >
          發布需求
        </button>
        <PostRequestSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      </div>
    );
  }

  return (
    <div className="px-4 py-3 flex flex-col gap-5">

      {/* Accepted private invites — open chat */}
      {acceptedInvites.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-brand-ink mb-2">已配對 ✨</h2>
          <div className="flex flex-col gap-3">
            {acceptedInvites.map((inv) => {
              const otherId = inv.fromUserId === state.currentUserId ? inv.toUserId : inv.fromUserId;
              const other = state.users.find((u) => u.id === otherId);
              const threadId = getThreadId(state.currentUserId, otherId);
              return (
                <div key={inv.id} className="bg-white rounded-2xl border border-brand-sky/40 p-4 shadow-card">
                  <div className="flex items-center gap-3">
                    {other && (
                      <img src={other.avatarUrl} alt={other.nickname} className="w-11 h-11 rounded-full object-cover ring-2 ring-brand-sky/50" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-ink">
                        {other?.nickname} 接受了你的邀請 🎉
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">聊天視窗已開啟，8 小時後關閉</p>
                    </div>
                  </div>
                  <button
                    onClick={() => router.push(`/chat/${threadId}`)}
                    className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-sky text-brand-ink font-semibold text-sm active:scale-[0.98] transition-all shadow-card"
                  >
                    <MessageCircle className="w-4 h-4" strokeWidth={2} />
                    開始聊天
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Teaser messages from girls */}
      {teasers.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-brand-ink mb-2">有人對你感興趣 👀</h2>
          <div className="flex flex-col gap-2">
            {teasers.map((t) => {
              const from = state.users.find((u) => u.id === t.fromUserId);
              return (
                <button
                  key={t.id}
                  onClick={() => router.push(`/u/${t.fromUserId}`)}
                  className="w-full flex items-center gap-3 bg-white rounded-2xl border border-brand-lavender p-3.5 shadow-card text-left active:bg-brand-ice transition-colors"
                >
                  {from && (
                    <img src={from.avatarUrl} alt={from.nickname} className="w-10 h-10 rounded-full object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand-ink">{from?.nickname}</p>
                    <p className="text-sm text-zinc-500 mt-0.5">「{t.text}」</p>
                  </div>
                  <span className="text-xs text-zinc-400 shrink-0">
                    {formatDistanceToNow(new Date(t.createdAt), { locale: zhTW, addSuffix: true })}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* My open requests */}
      {myRequests.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-brand-ink mb-2">
            我的需求 ({myRequests.length})
          </h2>
          <div className="flex flex-col gap-3">
            {myRequests.map((req) => (
              <RequestCard key={req.id} request={req} variant="inbox" />
            ))}
          </div>
        </section>
      )}

      {/* Responses received on my requests */}
      {responsesReceived.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-brand-ink mb-2">收到的回應</h2>
          <div className="bg-white rounded-2xl border border-brand-lavender shadow-card overflow-hidden">
            {responsesReceived.map((resp, i) => {
              const responder = state.users.find((u) => u.id === resp.userId);
              return (
                <button
                  key={resp.id}
                  onClick={() => router.push(`/requests/${resp.requestId}`)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-ice transition-colors ${i > 0 ? 'border-t border-brand-lavender' : ''}`}
                >
                  {responder && (
                    <img src={responder.avatarUrl} alt={responder.nickname} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand-ink">
                      <span className="font-semibold">{responder?.nickname}</span>{' '}
                      對你的需求表示興趣
                    </p>
                    {resp.note && <p className="text-xs text-zinc-400 truncate">「{resp.note}」</p>}
                  </div>
                  <span className="text-xs text-zinc-400 shrink-0">
                    {formatDistanceToNow(new Date(resp.createdAt), { locale: zhTW, addSuffix: true })}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
