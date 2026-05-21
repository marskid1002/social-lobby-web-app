'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { RequestCard } from '@/components/RequestCard';
import { PostRequestSheet } from '@/components/PostRequestSheet';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Check, X } from 'lucide-react';

export default function InboxPage() {
  const { state, respondToInvite } = useAppState();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState('');

  const myRequests = state.requests.filter(
    (r) => r.creatorId === state.currentUserId && r.status === 'open'
  );

  const pendingInvites = state.invitations.filter(
    (i) => i.toUserId === state.currentUserId && i.status === 'pending'
  );

  const responsesReceived = state.responses.filter((resp) =>
    myRequests.some((req) => req.id === resp.requestId)
  );

  const isEmpty = myRequests.length === 0 && pendingInvites.length === 0 && responsesReceived.length === 0;

  function handleInviteAccept(inviteId: string) {
    respondToInvite(inviteId, true);
    setToast('已接受邀請');
    setTimeout(() => setToast(''), 2000);
  }

  function handleInviteDecline(inviteId: string) {
    respondToInvite(inviteId, false);
    setToast('已婉拒邀請');
    setTimeout(() => setToast(''), 2000);
  }

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
      {/* My Requests */}
      {myRequests.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-brand-ink mb-2">
            我的需求 ({myRequests.length})
          </h2>
          <div className="flex flex-col gap-3">
            {myRequests.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                variant="inbox"
              />
            ))}
          </div>
        </section>
      )}

      {/* Invitations received */}
      {pendingInvites.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-brand-ink mb-2">
            收到的邀請 ({pendingInvites.length})
          </h2>
          <div className="flex flex-col gap-3">
            {pendingInvites.map((inv) => {
              const from = state.users.find((u) => u.id === inv.fromUserId);
              const req = state.requests.find((r) => r.id === inv.requestId);
              return (
                <div key={inv.id} className="bg-white rounded-2xl border border-brand-lavender p-4 shadow-card">
                  <div className="flex items-center gap-2 mb-2">
                    {from && (
                      <img src={from.avatarUrl} alt={from.nickname} className="w-9 h-9 rounded-full object-cover" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-ink">{from?.nickname} 邀請你加入</p>
                      {req && (
                        <p className="text-xs text-zinc-400">
                          {req.requestType === 'after_party' ? 'After Party' : req.requestType} · {req.area}
                        </p>
                      )}
                    </div>
                  </div>
                  {inv.message && (
                    <p className="text-sm text-zinc-600 italic mb-3">「{inv.message}」</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleInviteAccept(inv.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-brand-sky text-brand-ink font-semibold text-sm active:scale-[0.98] transition-all"
                    >
                      <Check className="w-4 h-4" strokeWidth={2} /> 接受
                    </button>
                    <button
                      onClick={() => handleInviteDecline(inv.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-brand-lavender text-zinc-500 font-semibold text-sm active:scale-[0.98] transition-all"
                    >
                      <X className="w-4 h-4" strokeWidth={2} /> 婉拒
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Responses received */}
      {responsesReceived.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-brand-ink mb-2">收到的回應</h2>
          <div className="bg-white rounded-2xl border border-brand-lavender shadow-card overflow-hidden">
            {responsesReceived.map((resp, i) => {
              const responder = state.users.find((u) => u.id === resp.userId);
              const req = state.requests.find((r) => r.id === resp.requestId);
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
                      {resp.responseStatus === 'joining' ? '想加入' : '對你的需求表示興趣'}
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

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-brand-ink text-white text-sm rounded-full px-5 py-2.5 shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
