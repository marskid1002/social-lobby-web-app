'use client';

import { use, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, MapPin, Users, Share2, Pencil } from 'lucide-react';
import { useAppState } from '@/lib/state';
import { PostRequestSheet } from '@/components/PostRequestSheet';
import { formatDistanceToNow, formatDistance } from 'date-fns';
import { zhTW } from 'date-fns/locale';

const TYPE_LABELS: Record<string, string> = {
  after_party: 'After Party',
  drinking: '喝一杯',
  fill_spot: '補位',
  last_minute: '臨時約會',
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
    declineResponder,
    joinRequest, acceptResponder,
    cancelJoinRequest,
    recordRequestViewer,
  } = useAppState();
  const [toast, setToast] = useState('');
  const [acceptingResponseId, setAcceptingResponseId] = useState<string | null>(null);
  const [showEditSheet, setShowEditSheet] = useState(false);

  const rejectTargetId  = useRef<string | null>(null);
  const [showConfirmSheet, setShowConfirmSheet] = useState(false);

  // 安全返回：PWA 從推播進來沒有上一頁記錄時，router.back() 會卡住 → 改導到收件匣
  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/inbox');
  };

  const request = state.requests.find((r) => r.id === id);
  if (!request) return <div className="p-8 text-center text-zinc-400">找不到此邀請</div>;

  const creator   = state.users.find((u) => u.id === request.creatorId);
  const responses = state.responses.filter((r) => r.requestId === id);
  const invitations = state.invitations.filter((i) => i.requestId === id);

  const isCreator  = state.currentUserId === request.creatorId;
  const isEscort   = currentUser?.role === 'escort';
  // Only count active responses (not withdrawn) for the escort's CTA state
  const myResponse = responses.find(
    (r) => r.userId === state.currentUserId && r.responseStatus !== 'withdrawn'
  );
  const myInvite   = invitations.find((i) => i.toUserId === state.currentUserId && i.status === 'pending');

  // Split responses by status
  const interestedList = responses.filter((r) => r.responseStatus === 'interested');
  const joiners        = responses.filter((r) => r.responseStatus === 'joining');
  const isAtCap        = request.status === 'closed'; // #5 派工無上限：僅已關閉才視為不可加入

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
    setTimeout(goBack, 1200);
  }

  function handleCancelJoin() {
    cancelJoinRequest(id);
    showToast('已取消加入請求');
  }

  function handleJoin() {
    joinRequest(id);
    showToast('已送出加入請求 ⏳');
  }

  async function handleAccept(responseId: string) {
    if (acceptingResponseId) return;
    setAcceptingResponseId(responseId);
    try {
      await acceptResponder(responseId);
      showToast('已接受！聊天室建立完成 ✨');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '聊天室建立失敗，請稍後再試');
    } finally {
      setAcceptingResponseId(null);
    }
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
    // 拒絕已入局者：發局不佔額度，直接確認
    setShowConfirmSheet(true);
  }

  function handleConfirmReject() {
    if (!rejectTargetId.current) return;
    declineResponder(rejectTargetId.current);
    rejectTargetId.current = null;
    setShowConfirmSheet(false);
    showToast('已拒絕，名額重新開放 🔓');
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
        <button onClick={goBack} className="p-1.5 rounded-full hover:bg-brand-ice" aria-label="返回">
          <ArrowLeft className="w-5 h-5 text-brand-ink" strokeWidth={1.75} />
        </button>
        <h1 className="flex-1 text-base font-semibold text-brand-ink">邀請詳情</h1>
        {isCreator && request.status === 'open' && (
          <button
            onClick={() => setShowEditSheet(true)}
            className="p-1.5 rounded-full hover:bg-brand-ice"
            aria-label="編輯邀請"
          >
            <Pencil className="w-5 h-5 text-zinc-500" strokeWidth={1.75} />
          </button>
        )}
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

        {/* Escort inline join CTA — right below the request info */}
        {isEscort && !isCreator && (
          <div>
            {myResponse?.responseStatus === 'joining' ? (
              <div className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-green-50 border border-green-200">
                <span className="text-sm font-bold text-green-600">✓ 已加入 · 前往收件匣查看聊天</span>
              </div>
            ) : myResponse?.responseStatus === 'interested' ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-brand-lavender/40">
                  <span className="text-sm font-semibold text-zinc-500">已送出請求，等待對方回應 ⏳</span>
                </div>
                <button
                  onClick={handleCancelJoin}
                  className="w-full py-2.5 rounded-2xl border border-red-200 text-xs font-semibold text-red-500 bg-red-50 active:bg-red-100 transition-colors"
                >
                  取消加入請求
                </button>
              </div>
            ) : isAtCap ? (
              <div className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-zinc-100">
                <span className="text-sm font-semibold text-zinc-400">此局已額滿</span>
              </div>
            ) : (
              /* Gradient border pill */
              <div style={{ background: 'linear-gradient(135deg, #8BD8F1, #DED9E5, #F7BEF1)', padding: '2px', borderRadius: '16px' }}>
                <button
                  onClick={handleJoin}
                  className="w-full py-4 rounded-[14px] bg-white font-bold text-base text-brand-ink active:bg-brand-snow transition-colors"
                >
                  請求加入這個局 ✨
                </button>
              </div>
            )}
          </div>
        )}

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
                        onClick={() => !isAtCap && handleAccept(resp.id)}
                        disabled={isAtCap || acceptingResponseId !== null}
                        className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${
                          isAtCap || acceptingResponseId !== null
                            ? 'bg-zinc-100 text-zinc-300 cursor-not-allowed'
                            : 'bg-brand-sky text-brand-ink active:scale-95'
                        }`}
                      >
                        {acceptingResponseId === resp.id ? '建立中…' : '接受'}
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
            {isCreator && (
              <button
                onClick={() => router.push('/inbox')}
                className="mt-3 w-full py-2.5 rounded-xl bg-brand-sky/15 text-brand-sky text-sm font-bold active:scale-[0.98] transition-transform"
              >
                💬 前往收件匣開始聊天
              </button>
            )}
          </div>
        )}
      </div>

      <PostRequestSheet
        open={showEditSheet}
        onClose={() => setShowEditSheet(false)}
        request={isCreator ? request : undefined}
        onSaved={() => showToast('邀請資料已更新')}
      />

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-brand-lavender bg-white px-4 py-3 pb-safe">
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
        ) : myInvite ? (
          <div className="flex gap-2">
            <button onClick={handleInviteAccept} className="flex-1 py-3.5 rounded-2xl bg-brand-sky text-brand-ink font-semibold text-sm active:scale-[0.98] transition-all">接受</button>
            <button onClick={handleInviteDecline} className="flex-1 py-3.5 rounded-2xl border border-brand-lavender text-zinc-500 font-semibold text-sm active:scale-[0.98] transition-all">婉拒</button>
          </div>
        ) : !isEscort ? (
          <button disabled className="w-full py-3.5 rounded-2xl bg-zinc-100 text-zinc-400 font-semibold text-sm">
            {isAtCap ? '已額滿' : '僅限女性用戶加入'}
          </button>
        ) : null}
      </div>

      {/* ── Confirm reject sheet (joining → penalty) ── */}
      {showConfirmSheet && (
        <div className="app-modal-layer fixed inset-0 flex items-end justify-center" onClick={() => setShowConfirmSheet(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="app-bottom-sheet relative w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-5" />
            <p className="text-base font-bold text-brand-ink mb-1">確認拒絕？</p>
            <p className="text-sm text-zinc-500 mb-5 leading-snug">她將被移除，名額重新開放。</p>
            <button onClick={handleConfirmReject} className="w-full py-3.5 rounded-2xl bg-red-500 text-white font-semibold text-base active:scale-[0.98] transition-all mb-2 shadow-card">
              確認拒絕
            </button>
            <button onClick={() => setShowConfirmSheet(false)} className="w-full py-3 rounded-2xl border border-brand-lavender text-zinc-500 font-semibold text-sm">取消</button>
          </div>
        </div>
      )}

      {toast && (
        <div className="app-toast-layer fixed bottom-24 left-1/2 -translate-x-1/2 bg-brand-ink text-white text-sm rounded-full px-5 py-2.5 shadow-lg pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}
