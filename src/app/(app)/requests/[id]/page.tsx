'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MoreVertical, Clock, MapPin, Users, Share2 } from 'lucide-react';
import { useAppState } from '@/lib/state';
import { formatDistanceToNow, formatDistance } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { useState } from 'react';

const TYPE_LABELS: Record<string, string> = {
  after_party: 'After Party',
  drinking: '喝一杯',
  fill_spot: '補位',
  last_minute: '臨時局',
  other: '其他',
};

const TYPE_COLORS: Record<string, string> = {
  after_party: '#F7BEF1',
  drinking: '#F59E0B',
  fill_spot: '#8BD8F1',
  last_minute: '#EF4444',
  other: '#DED9E5',
};

const RESPONSE_LABELS: Record<string, string> = {
  interested: '有興趣',
  joining: '加入',
  declined: '婉拒',
  withdrawn: '已取消',
};

const INVITE_LABELS: Record<string, string> = {
  pending: '待回應',
  accepted: '已接受',
  declined: '已拒絕',
  expired: '已過期',
};

export default function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { state, respondToRequest, respondToInvite, closeRequest } = useAppState();
  const [toast, setToast] = useState('');

  const request = state.requests.find((r) => r.id === id);
  if (!request) return <div className="p-8 text-center text-zinc-400">找不到此需求</div>;

  const creator = state.users.find((u) => u.id === request.creatorId);
  const responses = state.responses.filter((r) => r.requestId === id);
  const invitations = state.invitations.filter((i) => i.requestId === id);

  const isCreator = state.currentUserId === request.creatorId;
  const myResponse = responses.find((r) => r.userId === state.currentUserId);
  const myInvite = invitations.find((i) => i.toUserId === state.currentUserId && i.status === 'pending');

  const typeColor = TYPE_COLORS[request.requestType] ?? '#DED9E5';
  const typeLabel = TYPE_LABELS[request.requestType] ?? request.requestType;

  const expiresIn = formatDistance(new Date(request.expiresAt), new Date(), { locale: zhTW });

  function handleRespond() {
    respondToRequest(id);
    setToast('已表示興趣');
    setTimeout(() => setToast(''), 2000);
  }

  function handleInviteAccept() {
    if (myInvite) {
      respondToInvite(myInvite.id, true);
      setToast('已接受邀請');
      setTimeout(() => setToast(''), 2000);
    }
  }

  function handleInviteDecline() {
    if (myInvite) {
      respondToInvite(myInvite.id, false);
      setToast('已婉拒邀請');
      setTimeout(() => setToast(''), 2000);
    }
  }

  function handleClose() {
    closeRequest(id);
    setToast('需求已關閉');
    setTimeout(() => {
      setToast('');
      router.back();
    }, 1000);
  }

  function handleShare() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
    }
    setToast('連結已複製');
    setTimeout(() => setToast(''), 2000);
  }

  return (
    <div className="min-h-screen bg-brand-snow">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-brand-lavender px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-full hover:bg-brand-ice" aria-label="返回">
          <ArrowLeft className="w-5 h-5 text-brand-ink" strokeWidth={1.75} />
        </button>
        <h1 className="flex-1 text-base font-semibold text-brand-ink">需求詳情</h1>
        <button onClick={handleShare} className="p-1.5 rounded-full hover:bg-brand-ice" aria-label="分享">
          <Share2 className="w-5 h-5 text-zinc-500" strokeWidth={1.75} />
        </button>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">
        {/* Header card */}
        <div className="bg-white rounded-2xl p-4 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-3 py-1 rounded-full text-xs font-semibold text-brand-ink" style={{ backgroundColor: typeColor }}>
              {typeLabel}
            </span>
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <MapPin className="w-3 h-3" strokeWidth={1.75} /> {request.area}
            </span>
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <Users className="w-3 h-3" strokeWidth={1.75} /> {request.peopleCount} 人
            </span>
          </div>
          <p className="text-sm text-brand-ink mb-3 leading-relaxed">{request.note}</p>
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            <Clock className="w-3 h-3" strokeWidth={1.75} />
            <span>
              發布於 {formatDistanceToNow(new Date(request.createdAt), { locale: zhTW, addSuffix: true })} ·{' '}
              {expiresIn}後自動關閉
            </span>
          </div>
        </div>

        {/* Creator */}
        {creator && (
          <div className="bg-white rounded-2xl p-4 shadow-card">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">發布者</p>
            <button
              onClick={() => router.push(`/u/${creator.id}`)}
              className="flex items-center gap-3 active:opacity-70"
            >
              <img src={creator.avatarUrl} alt={creator.nickname} className="w-10 h-10 rounded-full object-cover" />
              <span className="text-sm font-semibold text-brand-ink">{creator.nickname}</span>
            </button>
          </div>
        )}

        {/* Invitees */}
        {invitations.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-card">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
              受邀者 ({invitations.length})
            </p>
            <div className="flex flex-col gap-2">
              {invitations.map((inv) => {
                const invitee = state.users.find((u) => u.id === inv.toUserId);
                return invitee ? (
                  <div key={inv.id} className="flex items-center gap-3">
                    <img src={invitee.avatarUrl} alt={invitee.nickname} className="w-8 h-8 rounded-full object-cover" />
                    <span className="flex-1 text-sm text-brand-ink">{invitee.nickname}</span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-brand-lavender text-zinc-500 font-medium">
                      {INVITE_LABELS[inv.status]}
                    </span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        )}

        {/* Responders */}
        {responses.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-card">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
              回應的人 ({responses.length})
            </p>
            <div className="flex flex-col gap-2">
              {responses.map((resp) => {
                const responder = state.users.find((u) => u.id === resp.userId);
                return responder ? (
                  <div key={resp.id} className="flex items-center gap-3">
                    <img src={responder.avatarUrl} alt={responder.nickname} className="w-8 h-8 rounded-full object-cover" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-brand-ink font-medium">{responder.nickname}</span>
                      {resp.note && <p className="text-xs text-zinc-400 truncate">「{resp.note}」</p>}
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: '#8BD8F120', color: '#3B82F6' }}>
                      {RESPONSE_LABELS[resp.responseStatus]}
                    </span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-brand-lavender px-4 py-3 pb-safe">
        {isCreator ? (
          <button
            onClick={handleClose}
            disabled={request.status === 'closed'}
            className="w-full py-3.5 rounded-2xl border-2 border-red-200 text-red-500 font-semibold text-sm bg-white active:bg-red-50 disabled:opacity-40 transition-colors"
          >
            {request.status === 'closed' ? '需求已關閉' : '關閉需求'}
          </button>
        ) : myResponse ? (
          <button disabled className="w-full py-3.5 rounded-2xl bg-brand-lavender text-zinc-400 font-semibold text-sm">
            已回應
          </button>
        ) : myInvite ? (
          <div className="flex gap-2">
            <button
              onClick={handleInviteAccept}
              className="flex-1 py-3.5 rounded-2xl bg-brand-sky text-brand-ink font-semibold text-sm active:scale-[0.98] transition-all"
            >
              接受
            </button>
            <button
              onClick={handleInviteDecline}
              className="flex-1 py-3.5 rounded-2xl border border-brand-lavender text-zinc-500 font-semibold text-sm active:scale-[0.98] transition-all"
            >
              婉拒
            </button>
          </div>
        ) : (
          <button
            onClick={handleRespond}
            className="w-full py-3.5 rounded-2xl bg-brand-sky text-brand-ink font-semibold text-base active:scale-[0.98] transition-all shadow-card"
          >
            我想加入
          </button>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-brand-ink text-white text-sm rounded-full px-5 py-2.5 shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
