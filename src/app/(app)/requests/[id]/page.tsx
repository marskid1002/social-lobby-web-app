'use client';

import { use, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, MapPin, Users, Share2, ShoppingBag } from 'lucide-react';
import { useAppState } from '@/lib/state';
import { formatDistanceToNow, formatDistance } from 'date-fns';
import { zhTW } from 'date-fns/locale';

const TYPE_LABELS: Record<string, string> = {
  after_party: 'After Party',
  drinking: '喝一杯',
  fill_spot: '補位',
  last_minute: '臨時局',
  other: '其他',
};

const TYPE_COLORS: Record<string, string> = {
  after_party: '#F7BEF1',
  drinking:    '#F59E0B',
  fill_spot:   '#8BD8F1',
  last_minute: '#EF4444',
  other:       '#DED9E5',
};

const INVITE_LABELS: Record<string, string> = {
  pending:  '待回應',
  accepted: '已接受',
  declined: '已拒絕',
  expired:  '已過期',
};

export default function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const {
    state, currentUser,
    respondToInvite, closeRequest,
    declineResponder, buyExtraSlot,
    joinRequest, acceptResponder,
    recordRequestViewer,
  } = useAppState();
  const [toast, setToast] = useState('');

  const rejectTargetId  = useRef<string | null>(null);
  const [showConfirmSheet, setShowConfirmSheet] = useState(false);
  const [showNoSlotSheet, setShowNoSlotSheet]   = useState(false);

  const request = state.requests.find((r) => r.id === id);
  if (!request) return <div className="p-8 text-center text-zinc-400">找不到此邀請</div>;

  const creator   = state.users.find((u) => u.id === request.creatorId);
  const responses = state.responses.filter((r) => r.requestId === id);
  const invitations = state.invitations.filter((i) => i.requestId === id);

  const isCreator  = state.currentUserId === request.creatorId;
  const isEscort   = currentUser?.role === 'escort';
  const myResponse = responses.find((r) => r.userId === state.currentUserId);
  const myInvite   = invitations.find((i) => i.toUserId === state.currentUserId && i.status === 'pending');

  // Split responses by status
  const interestedList = responses.filter((r) => r.responseStatus === 'interested');
  const joiners        = responses.filter((r) => r.responseStatus === 'joining');
  const isAtCap        = joiners.length >= request.peopleCount;

  // FOMO viewers (exclude anyone who has already responded)
  const respondedIds = new Set(responses.map((r) => r.userId));
  const viewerUsers = (request.requestViewers ?? [])
    .filter((uid) => !respondedIds.has(uid))
    .map((uid) => state.users.find((u) => u.id === uid))
    .filter(Boolean) as typeof state.users;

  // Record this escort as a viewer on mount (once, guarded)
  const viewerRecorded = useRef(false);
  useEffect(() => {
    if (!viewerRecorded.current && isEscort && !isCreator && !myResponse) {
      viewerRecorded.current = true;
      recordRequestViewer(id);
    }
  }, []);

  const typeColor  = TYPE_COLORS[request.requestType] ?? '#DED9E5';
  const typeLabel  = TYPE_LABELS[request.requestType] ?? request.requestType;
  const expiresIn  = formatDistance(new Date(request.expiresAt), new Date(), { locale: zhTW });
  const isExpired  = new Date(request.expiresAt) <= new Date();

  const slotsLeft     = currentUser?.monthlyRequestsLeft ?? 0;
  const isVip         = currentUser?.tier === 'vip';
  const canAffordSlot = (currentUser?.credits ?? 0) >= 35;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  function handleInviteAccept() {
    if (myInvite) { respondToInvite(myInvite.id, true); showToast('已接受邀請'); }
  }
  function handleInviteDecline() {
    if (myInvite) { respondToInvite(myInvite.id, false); showToast('已婉拒邀請'); }
  }

  function handleClose() {
    closeRequest(id);
    showToast('邀請已關閉');
    setTimeout(() => router.back(), 1200);
  }

  function handleJoin() {
    joinRequest(id);
    showToast('已送出加入請求 ⏳');
  }

  function handleAccept(responseId: string) {
    acceptResponder(responseId);
    showToast('已接受！聊天已開啟 ✨');
  }

  function handleRejectTap(responseId: string) {
    rejectTargetId.current = responseId;
    const wasAccepted = responses.find((r) => r.id === responseId)?.responseStatus === 'joining';
    if (!wasAccepted) {
      // Rejecting 'interested' — free, no slot cost, just decline directly
      declineResponder(responseId);
      showToast('已婉拒');
      return;
    }
    // Rejecting a 'joining' — costs a slot
    if (!isVip && slotsLeft <= 0) {
      setShowNoSlotSheet(true);
    } else {
      setShowConfirmSheet(true);
    }
  }

  function handleConfirmReject() {
    if (!rejectTargetId.current) return;
    declineResponder(rejectTargetId.current);
    rejectTargetId.current = null;
    setShowConfirmSheet(false);
    showToast('已拒絕，名額重新開放 🔓');
  }

  function handleBuySlotAndReject() {
    if (!rejectTargetId.current) return;
    buyExtraSlot();
    declineResponder(rejectTargetId.current);
    rejectTargetId.current = null;
    setShowNoSlotSheet(false);
    showToast('已使用 35 💗，名額重新開放 🔓');
  }

  function handleShare() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
    }
    showToast('連結已複製');
  }

  return (
    <div className="min-h-screen bg-brand-snow pb-32">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-brand-lavender px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-full hover:bg-brand-ice" aria-label="返回">
          <ArrowLeft className="w-5 h-5 text-brand-ink" strokeWidth={1.75} />
        </button>
        <h1 className="flex-1 text-base font-semibold text-brand-ink">邀請詳情</h1>
        <button onClick={handleShare} className="p-1.5 rounded-full hover:bg-brand-ice" aria-label="分享">
          <Share2 className="w-5 h-5 text-zinc-500" strokeWidth={1.75} />
        </button>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">
        {/* Header card — includes FOMO strip */}
        <div className="bg-white rounded-2xl p-4 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-3 py-1 rounded-full text-xs font-semibold text-brand-ink" style={{ backgroundColor: typeColor }}>
              {typeLabel}
            </span>
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <MapPin className="w-3 h-3" strokeWidth={1.75} /> {request.area}
            </span>
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <Users className="w-3 h-3" strokeWidth={1.75} /> {joiners.length}/{request.peopleCount} 人
            </span>
          </div>

          <p className="text-sm text-brand-ink mb-3 leading-relaxed">{request.note}</p>

          {/* FOMO strip — inside header, creator-only, below note */}
          {isCreator && viewerUsers.length > 0 && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-brand-snow">
              <div className="flex -space-x-1.5 shrink-0">
                {viewerUsers.slice(0, 3).map((u) => (
                  <img key={u.id} src={u.avatarUrl} alt={u.nickname} className="w-5 h-5 rounded-full border border-white object-cover" />
                ))}
              </div>
              <p className="text-[11px] text-zinc-500">
                {viewerUsers.slice(0, 3).map((u) => u.nickname.slice(0, 2)).join('、')}
                {viewerUsers.length > 3 ? ` 等 ${viewerUsers.length} 人` : ''}
                {' 看過但還沒加入'}
              </p>
            </div>
          )}

          <div className="flex items-center gap-1 text-xs text-zinc-400 mt-3">
            <Clock className="w-3 h-3" strokeWidth={1.75} />
            <span>
              {formatDistanceToNow(new Date(request.createdAt), { locale: zhTW, addSuffix: true })}
              {' · '}
              {isExpired ? '已過期' : `${expiresIn}後關閉`}
            </span>
          </div>
        </div>

        {/* Creator */}
        {creator && (
          <div className="bg-white rounded-2xl p-4 shadow-card">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">發布者</p>
            <button onClick={() => router.push(`/u/${creator.id}`)} className="flex items-center gap-3 active:opacity-70">
              <img src={creator.avatarUrl} alt={creator.nickname} className="w-10 h-10 rounded-full object-cover" />
              <span className="text-sm font-semibold text-brand-ink">{creator.nickname}</span>
            </button>
          </div>
        )}

        {/* Interested section — creator only, shows accept/decline per row */}
        {isCreator && interestedList.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-card">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
              想加入 ({interestedList.length})
            </p>
            <div className="flex flex-col gap-3">
              {interestedList.map((resp) => {
                const user = state.users.find((u) => u.id === resp.userId);
                return user ? (
                  <div key={resp.id} className="flex items-center gap-3">
                    <button onClick={() => router.push(`/u/${user.id}`)}>
                      <img src={user.avatarUrl} alt={user.nickname} className="w-9 h-9 rounded-full object-cover" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-ink">{user.nickname}</p>
                      {resp.note && <p className="text-xs text-zinc-400 truncate">「{resp.note}」</p>}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => handleAccept(resp.id)}
                        className="text-xs px-3 py-1.5 rounded-xl bg-brand-sky text-brand-ink font-semibold active:scale-95 transition-all"
                      >
                        接受
                      </button>
                      <button
                        onClick={() => handleRejectTap(resp.id)}
                        className="text-xs px-3 py-1.5 rounded-xl border border-zinc-200 text-zinc-500 font-semibold active:bg-zinc-50 transition-all"
                      >
                        婉拒
                      </button>
                    </div>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        )}

        {/* Joiners section */}
        {joiners.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                已加入 ({joiners.length}/{request.peopleCount})
              </p>
              {isAtCap && (
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-red-50 text-red-500">
                  額滿
                </span>
              )}
            </div>
            <div className="flex flex-col gap-3">
              {joiners.map((resp) => {
                const joiner = state.users.find((u) => u.id === resp.userId);
                return joiner ? (
                  <div key={resp.id} className="flex items-center gap-3">
                    <button onClick={() => router.push(`/u/${joiner.id}`)}>
                      <img src={joiner.avatarUrl} alt={joiner.nickname} className="w-9 h-9 rounded-full object-cover" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-ink">{joiner.nickname}</p>
                      {resp.note && <p className="text-xs text-zinc-400 truncate">「{resp.note}」</p>}
                    </div>
                    {isCreator && (
                      <button
                        onClick={() => handleRejectTap(resp.id)}
                        className="shrink-0 text-xs px-3 py-1.5 rounded-xl border border-red-200 text-red-500 font-semibold active:bg-red-50 transition-colors"
                      >
                        拒絕
                      </button>
                    )}
                  </div>
                ) : null;
              })}
            </div>
          </div>
        )}

        {/* Invitees */}
        {invitations.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-card">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">受邀者 ({invitations.length})</p>
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
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-brand-lavender px-4 py-3 pb-safe">
        {isCreator ? (
          joiners.length > 0 ? (
            <div className="text-center">
              <p className="text-xs text-zinc-400 mb-1">有人已加入，請先拒絕所有人才能關閉</p>
              <button disabled className="w-full py-3.5 rounded-2xl bg-zinc-100 text-zinc-400 font-semibold text-sm cursor-not-allowed">
                關閉邀請（不可用）
              </button>
            </div>
          ) : (
            <button
              onClick={handleClose}
              disabled={request.status === 'closed'}
              className="w-full py-3.5 rounded-2xl border-2 border-red-200 text-red-500 font-semibold text-sm bg-white active:bg-red-50 disabled:opacity-40 transition-colors"
            >
              {request.status === 'closed' ? '邀請已關閉' : '關閉邀請'}
            </button>
          )
        ) : isEscort ? (
          myResponse?.responseStatus === 'joining' ? (
            <button disabled className="w-full py-3.5 rounded-2xl bg-brand-lavender text-zinc-400 font-semibold text-sm">
              已加入 · 前往收件匣查看聊天
            </button>
          ) : myResponse?.responseStatus === 'interested' ? (
            <button disabled className="w-full py-3.5 rounded-2xl bg-brand-lavender text-zinc-400 font-semibold text-sm">
              已送出請求，等待對方回應 ⏳
            </button>
          ) : isAtCap ? (
            <button disabled className="w-full py-3.5 rounded-2xl bg-zinc-100 text-zinc-400 font-semibold text-sm">
              此局已額滿
            </button>
          ) : (
            <button
              onClick={handleJoin}
              className="w-full py-3.5 rounded-2xl font-semibold text-base active:scale-[0.98] transition-all shadow-card text-brand-ink"
              style={{ background: 'linear-gradient(135deg, #8BD8F1 0%, #F7BEF1 100%)' }}
            >
              請求加入這個局 ✨
            </button>
          )
        ) : myInvite ? (
          <div className="flex gap-2">
            <button onClick={handleInviteAccept} className="flex-1 py-3.5 rounded-2xl bg-brand-sky text-brand-ink font-semibold text-sm active:scale-[0.98] transition-all">接受</button>
            <button onClick={handleInviteDecline} className="flex-1 py-3.5 rounded-2xl border border-brand-lavender text-zinc-500 font-semibold text-sm active:scale-[0.98] transition-all">婉拒</button>
          </div>
        ) : (
          <button disabled className="w-full py-3.5 rounded-2xl bg-zinc-100 text-zinc-400 font-semibold text-sm">
            {isAtCap ? '已額滿' : '僅限女性用戶加入'}
          </button>
        )}
      </div>

      {/* ── Confirm reject sheet (joining → penalty) ── */}
      {showConfirmSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowConfirmSheet(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-[28px] p-5 pb-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-5" />
            <p className="text-base font-bold text-brand-ink mb-1">確認拒絕？</p>
            <p className="text-sm text-zinc-500 mb-1 leading-snug">她將被移除，名額重新開放。</p>
            <p className="text-sm text-red-500 font-semibold mb-5">
              此操作將消耗 1 次本月邀請名額（{isVip ? '∞' : slotsLeft} → {isVip ? '∞' : slotsLeft - 1}）
            </p>
            <button onClick={handleConfirmReject} className="w-full py-3.5 rounded-2xl bg-red-500 text-white font-semibold text-base active:scale-[0.98] transition-all mb-2 shadow-card">
              確認拒絕（−1 名額）
            </button>
            <button onClick={() => setShowConfirmSheet(false)} className="w-full py-3 rounded-2xl border border-brand-lavender text-zinc-500 font-semibold text-sm">取消</button>
          </div>
        </div>
      )}

      {/* ── No-slot upsell sheet ── */}
      {showNoSlotSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => { setShowNoSlotSheet(false); rejectTargetId.current = null; }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-[28px] p-5 pb-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-5" />
            <p className="text-base font-bold text-brand-ink mb-1">本月名額已用完</p>
            <p className="text-sm text-zinc-500 mb-4 leading-snug">消耗 35 💗 可獲得 1 次額外名額，拒絕她並重新開放邀請。</p>
            <div className="flex items-center justify-between bg-brand-ice rounded-2xl px-4 py-3 mb-4">
              <span className="text-sm text-zinc-500">目前點數</span>
              <span className="text-lg font-bold text-brand-ink">{currentUser?.credits ?? 0} 💗</span>
            </div>
            {canAffordSlot ? (
              <button onClick={handleBuySlotAndReject} className="w-full py-3.5 rounded-2xl bg-brand-sky text-brand-ink font-semibold text-base active:scale-[0.98] transition-all mb-2 shadow-card">
                消耗 35 💗 並拒絕
              </button>
            ) : (
              <>
                <p className="text-xs text-red-500 text-center mb-3 font-semibold">點數不足（需要 35 💗）</p>
                <button onClick={() => { setShowNoSlotSheet(false); rejectTargetId.current = null; router.push('/store'); }} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-amber-400 text-white font-semibold text-base active:scale-[0.98] transition-all mb-2 shadow-card">
                  <ShoppingBag className="w-5 h-5" strokeWidth={1.75} />前往購買點數
                </button>
              </>
            )}
            <button onClick={() => { setShowNoSlotSheet(false); rejectTargetId.current = null; }} className="w-full py-3 rounded-2xl border border-brand-lavender text-zinc-500 font-semibold text-sm">取消</button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-brand-ink text-white text-sm rounded-full px-5 py-2.5 shadow-lg z-50 pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}
