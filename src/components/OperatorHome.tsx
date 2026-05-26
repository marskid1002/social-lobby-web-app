'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Bell, X, Check } from 'lucide-react';

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
  available: '可接局',
  bring_people: '可帶人',
  fill_spot: '補位',
  busy: '忙碌中',
};

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-100 text-green-700',
  bring_people: 'bg-blue-100 text-blue-700',
  fill_spot: 'bg-yellow-100 text-yellow-700',
  busy: 'bg-zinc-100 text-zinc-500',
};

export function OperatorHome() {
  const { state, closeRequest } = useAppState();
  const router = useRouter();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [dispatchSheet, setDispatchSheet] = useState<string | null>(null); // requestId
  const [selectedGirl, setSelectedGirl] = useState<string | null>(null);
  const [dispatched, setDispatched] = useState<Record<string, string>>({}); // requestId -> girlId
  const [toast, setToast] = useState('');

  const incomingRequests = state.requests.filter(
    (r) => r.status === 'open' && ['r-009', 'r-010', 'r-011'].includes(r.id)
  );

  const rosterGirls = ROSTER_IDS.map((id) => state.users.find((u) => u.id === id)).filter(Boolean);

  function handleDispatch() {
    if (!dispatchSheet || !selectedGirl) return;
    const girl = state.users.find((u) => u.id === selectedGirl);
    closeRequest(dispatchSheet);
    setDispatched((prev) => ({ ...prev, [dispatchSheet]: selectedGirl }));
    setDispatchSheet(null);
    setSelectedGirl(null);
    setToast(`✅ 已派 ${girl?.nickname} 接單，通知已發送`);
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
        <p className="text-sm font-bold text-brand-ink uppercase tracking-wider mb-4">新進局邀請</p>

        <div className="flex flex-col gap-3">
          {incomingRequests.map((req) => {
            const creator = state.users.find((u) => u.id === req.creatorId);
            const isDispatched = req.id in dispatched || req.status === 'closed';
            const typeColor = TYPE_COLORS[req.requestType] ?? '#DED9E5';
            const typeLabel = TYPE_LABELS[req.requestType] ?? req.requestType;

            return (
              <div key={req.id} className={`bg-white rounded-2xl border border-brand-lavender p-4 shadow-sm transition-opacity ${isDispatched ? 'opacity-60' : ''}`}>
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
                  {isDispatched ? (
                    <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-400">
                      <Check size={14} />
                      <span>已派遣</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setDispatchSheet(req.id); setSelectedGirl(null); }}
                      className="flex-1 py-2.5 rounded-xl bg-purple-100 text-sm font-semibold text-purple-700 border border-purple-200 active:bg-purple-200 transition-colors"
                    >
                      派人接單
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
        <p className="text-sm font-bold text-brand-ink uppercase tracking-wider">我的女生名單</p>
      </div>

      <div>
        {rosterGirls.map((user) => {
          if (!user) return null;
          const onlineStatus = state.onlineStatuses.find((s) => s.userId === user.id);
          return (
            <button
              key={user.id}
              onClick={() => router.push(`/u/${user.id}`)}
              className="flex items-center gap-3 px-4 py-3 bg-white border-b border-zinc-100 w-full text-left active:bg-brand-snow transition-colors"
            >
              <div className="relative shrink-0">
                <img src={user.avatarUrl} alt={user.nickname} className="w-10 h-10 rounded-full object-cover" />
                {onlineStatus && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-brand-ink truncate">{user.nickname}</span>
                  {onlineStatus && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[onlineStatus.status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                      {STATUS_LABELS[onlineStatus.status] ?? onlineStatus.status}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">{user.defaultArea}</p>
              </div>
            </button>
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
            <p className="text-base font-bold text-brand-ink mb-4 text-center">派誰去這個局？</p>

            <div className="flex flex-col gap-2 mb-5">
              {rosterGirls.map((user) => {
                if (!user) return null;
                const onlineStatus = state.onlineStatuses.find((s) => s.userId === user.id);
                const isSelected = selectedGirl === user.id;
                return (
                  <button
                    key={user.id}
                    onClick={() => setSelectedGirl(user.id)}
                    className={`flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-colors ${
                      isSelected
                        ? 'border-purple-400 bg-purple-50'
                        : 'border-transparent bg-brand-snow'
                    }`}
                  >
                    <img src={user.avatarUrl} alt={user.nickname} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-ink">{user.nickname}</p>
                      {onlineStatus && (
                        <p className="text-xs text-zinc-400">{STATUS_LABELS[onlineStatus.status] ?? '在線'}</p>
                      )}
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
              disabled={!selectedGirl}
              className="w-full py-3.5 rounded-2xl bg-purple-500 text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed active:bg-purple-600 transition-colors"
            >
              確認派遣
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
