'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Bell, X, Check, UserCog } from 'lucide-react';

const ROSTER_IDS = ['u-002', 'u-005', 'u-009', 'u-015'];

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

const STATUS_LABELS: Record<string, string> = {
  available: '有空',
  bring_people: '可同行',
  fill_spot: '臨時有空',
  busy: '忙碌中',
};

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-100 text-green-700',
  bring_people: 'bg-blue-100 text-blue-700',
  fill_spot: 'bg-yellow-100 text-yellow-700',
  busy: 'bg-zinc-100 text-zinc-500',
};

export function OperatorHome() {
  const { state, dispatchGirl, switchUser } = useAppState();
  const router = useRouter();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [dispatchSheet, setDispatchSheet] = useState<string | null>(null); // requestId
  const [selectedGirls, setSelectedGirls] = useState<string[]>([]); // 多選
  const [toast, setToast] = useState('');

  // 新進活動邀請：所有 open 狀態的局，包含
  //   1) VIP/一般用戶發的局
  //   2) 其他幹部發的局（讓兩個幹部互相看得到；不顯示自己發的）
  const incomingRequests = state.requests
    .filter((r) => {
      if (r.status !== 'open') return false;
      const creator = state.users.find((u) => u.id === r.creatorId);
      if (!creator) return false;
      if (creator.role === 'user') return true; // VIP / 一般用戶
      if (creator.role === 'manager' && r.creatorId !== state.currentUserId) return true; // 其他幹部
      return false;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const rosterGirls = ROSTER_IDS.map((id) => state.users.find((u) => u.id === id)).filter(Boolean);

  // 該局已派工的旗下女伴 id（interested 或 joining）
  function dispatchedGirlIds(requestId: string) {
    return state.responses
      .filter(
        (r) =>
          r.requestId === requestId &&
          ROSTER_IDS.includes(r.userId) &&
          (r.responseStatus === 'interested' || r.responseStatus === 'joining')
      )
      .map((r) => r.userId);
  }

  // 已派人數是否已達該局需求人數上限
  function isRequestFull(req: { id: string; peopleCount: number }) {
    return dispatchedGirlIds(req.id).length >= req.peopleCount;
  }

  // 開啟派工彈窗的局物件
  const activeReq = dispatchSheet ? state.requests.find((r) => r.id === dispatchSheet) : null;
  const alreadyDispatched = dispatchSheet ? dispatchedGirlIds(dispatchSheet) : [];
  const remainingSlots = activeReq ? activeReq.peopleCount - alreadyDispatched.length : 0;

  function toggleGirl(girlId: string) {
    setSelectedGirls((prev) => {
      if (prev.includes(girlId)) return prev.filter((id) => id !== girlId);
      // 不可超過剩餘名額
      if (prev.length >= remainingSlots) return prev;
      return [...prev, girlId];
    });
  }

  function handleDispatch() {
    if (!dispatchSheet || selectedGirls.length === 0) return;
    const names = selectedGirls
      .map((id) => state.users.find((u) => u.id === id)?.nickname)
      .filter(Boolean)
      .join('、');
    selectedGirls.forEach((girlId) => dispatchGirl(dispatchSheet, girlId));
    setDispatchSheet(null);
    setSelectedGirls([]);
    setToast(`✅ 已安排 ${names} 出席，通知已發送`);
    setTimeout(() => setToast(''), 3000);
  }

  return (
    <div className="pb-24">
      {/* LINE notification banner */}
      {!bannerDismissed && (
        <div className="mx-4 mt-4 mb-2 flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-dashed border-brand-pink bg-pink-50">
          <span className="text-xs font-bold text-brand-pink shrink-0">DEMO</span>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Bell size={14} className="text-brand-pink shrink-0" />
            <p className="text-xs text-zinc-600 truncate">📲 LINE 通知：你有新的局邀請，點此查看</p>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="shrink-0 text-zinc-400 active:text-zinc-600"
            aria-label="關閉通知"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        <p className="text-sm font-bold text-brand-ink uppercase tracking-wider mb-4">新進活動邀請</p>

        <div className="flex flex-col gap-3">
          {incomingRequests.map((req) => {
            const creator = state.users.find((u) => u.id === req.creatorId);
            const dispatchedCount = dispatchedGirlIds(req.id).length;
            const isFull = isRequestFull(req) || req.status === 'closed';
            const typeColor = TYPE_COLORS[req.requestType] ?? '#DED9E5';
            const typeLabel = TYPE_LABELS[req.requestType] ?? req.requestType;

            return (
              <div key={req.id} className={`bg-white rounded-2xl border border-brand-lavender p-4 shadow-sm transition-opacity ${isFull ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-2 mb-2">
                  {creator && (
                    <img src={creator.avatarUrl} alt={creator.nickname} className="w-8 h-8 rounded-full object-cover" />
                  )}
                  <div className="flex-1 min-w-0">
                    {creator && <p className="text-sm font-semibold text-brand-ink truncate">{creator.nickname}</p>}
                  </div>
                  <span className="text-xs text-zinc-400 shrink-0">
                    {formatDistanceToNow(new Date(req.createdAt), { locale: zhTW, addSuffix: true })}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-brand-ink"
                    style={{ backgroundColor: typeColor }}
                  >
                    {typeLabel}
                  </span>
                  <span className="text-xs text-zinc-500">{req.area} · {req.peopleCount} 人</span>
                </div>

                <p className="text-sm text-zinc-700 line-clamp-2 mb-3">{req.note}</p>

                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/requests/${req.id}`)}
                    className="flex-1 py-2.5 rounded-xl border border-brand-lavender text-sm font-semibold text-brand-ink bg-white active:bg-brand-snow transition-colors"
                  >
                    查看
                  </button>
                  {isFull ? (
                    <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-400">
                      <Check size={14} />
                      <span>已安排 {dispatchedCount}/{req.peopleCount}</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setDispatchSheet(req.id); setSelectedGirls([]); }}
                      className="flex-1 py-2.5 rounded-xl bg-purple-100 text-sm font-semibold text-purple-700 border border-purple-200 active:bg-purple-200 transition-colors"
                    >
                      {dispatchedCount > 0 ? `安排出席（${dispatchedCount}/${req.peopleCount}）` : '安排出席'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Roster section */}
      <div className="flex items-center gap-3 px-4 py-3 mt-2 bg-brand-snow border-y border-zinc-100">
        <p className="text-sm font-bold text-brand-ink uppercase tracking-wider">我的社群</p>
      </div>

      <div>
        {rosterGirls.map((user) => {
          if (!user) return null;
          const onlineStatus = state.onlineStatuses.find((s) => s.userId === user.id);
          return (
            <div
              key={user.id}
              className="flex items-center gap-3 px-4 py-3 bg-white border-b border-zinc-100"
            >
              <button onClick={() => router.push(`/u/${user.id}`)} className="relative shrink-0">
                <img src={user.avatarUrl} alt={user.nickname} className="w-10 h-10 rounded-full object-cover" />
                {onlineStatus && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-white" />
                )}
              </button>
              <button onClick={() => router.push(`/u/${user.id}`)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-brand-ink truncate">{user.nickname}</span>
                  {onlineStatus && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[onlineStatus.status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                      {STATUS_LABELS[onlineStatus.status] ?? onlineStatus.status}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">{user.defaultArea}</p>
              </button>
              <button
                onClick={() => { switchUser(user.id); router.push('/requests'); }}
                className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-purple-600 bg-purple-50 border border-purple-200 px-2.5 py-1.5 rounded-full active:bg-purple-100 transition-colors"
                aria-label={`以 ${user.nickname} 身份操作`}
              >
                <UserCog size={12} />
                操作
              </button>
            </div>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-brand-ink text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-lg z-50 whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* Dispatch bottom sheet */}
      {dispatchSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setDispatchSheet(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[430px] bg-white rounded-t-[28px] p-5 pb-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-4" />
            <p className="text-base font-bold text-brand-ink text-center">安排出席人選</p>
            <p className="text-xs text-zinc-400 mb-4 text-center">
              此局需求 {activeReq?.peopleCount ?? 0} 人 · 還可安排 {remainingSlots} 位
              {selectedGirls.length > 0 && `（已選 ${selectedGirls.length}）`}
            </p>

            <div className="flex flex-col gap-2 mb-5">
              {rosterGirls.map((user) => {
                if (!user) return null;
                const onlineStatus = state.onlineStatuses.find((s) => s.userId === user.id);
                const isAlready = alreadyDispatched.includes(user.id);
                const isSelected = selectedGirls.includes(user.id);
                const atLimit = !isSelected && selectedGirls.length >= remainingSlots;
                const disabled = isAlready || atLimit;
                return (
                  <button
                    key={user.id}
                    onClick={() => !isAlready && toggleGirl(user.id)}
                    disabled={disabled}
                    className={`flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-colors ${
                      isSelected
                        ? 'border-purple-400 bg-purple-50'
                        : 'border-transparent bg-brand-snow'
                    } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <img src={user.avatarUrl} alt={user.nickname} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-ink">{user.nickname}</p>
                      {isAlready ? (
                        <p className="text-xs text-purple-500 font-semibold">已安排</p>
                      ) : onlineStatus ? (
                        <p className="text-xs text-zinc-400">{STATUS_LABELS[onlineStatus.status] ?? '在線'}</p>
                      ) : null}
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center shrink-0">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleDispatch}
              disabled={selectedGirls.length === 0}
              className="w-full py-3.5 rounded-2xl bg-purple-500 text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed active:bg-purple-600 transition-colors"
            >
              確認出席{selectedGirls.length > 0 ? `（${selectedGirls.length} 位）` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
