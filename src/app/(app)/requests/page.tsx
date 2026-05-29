'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { RequestCard } from '@/components/RequestCard';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { MapPin, Clock, Users } from 'lucide-react';

const TYPE_FILTERS = [
  { value: null,          label: '全部' },
  { value: 'after_party', label: 'After Party' },
  { value: 'drinking',    label: '喝一杯' },
  { value: 'fill_spot',   label: '補位' },
  { value: 'last_minute', label: '臨時局' },
  { value: 'other',       label: '其他' },
];

const TYPE_COLORS: Record<string, string> = {
  after_party: '#F7BEF1',
  drinking:    '#F59E0B',
  fill_spot:   '#8BD8F1',
  last_minute: '#EF4444',
  other:       '#DED9E5',
};

export default function RequestsPage() {
  const { state, currentUser } = useAppState();
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const role = currentUser?.role;

  // Regular users go home; operators/managers stay; escorts also stay
  useEffect(() => {
    if (role === 'user') router.replace('/lobby/explore');
  }, [role, router]);

  if (role === 'user') return null;

  // Manager/operator view: all open requests from others
  if (role === 'manager' || role === 'operator') {
    const openRequests = state.requests.filter(
      (r) => r.status === 'open' && r.creatorId !== state.currentUserId
    );
    const filtered = openRequests.filter((r) => !typeFilter || r.requestType === typeFilter);

    return (
      <div className="px-4 py-3">
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
          {TYPE_FILTERS.map((f) => (
            <button
              key={String(f.value)}
              onClick={() => setTypeFilter(f.value)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                typeFilter === f.value ? 'bg-brand-ink text-white' : 'bg-white text-zinc-600 border border-brand-lavender'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {filtered.map((req) => (
            <RequestCard key={req.id} request={req} variant="ledger" creator={state.users.find((u) => u.id === req.creatorId)} />
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-zinc-400 text-sm">目前沒有公開需求</div>
          )}
        </div>
      </div>
    );
  }

  // ── Escort view ──────────────────────────────────────────────────────────────
  // Only show requests that: are open, not at cap, not already joined by this escort
  const myJoinedRequestIds = new Set(
    state.responses
      .filter((r) => r.userId === state.currentUserId && r.responseStatus === 'joining')
      .map((r) => r.requestId)
  );

  const joinerCounts = Object.fromEntries(
    state.requests.map((r) => [
      r.id,
      state.responses.filter((resp) => resp.requestId === r.id && resp.responseStatus === 'joining').length,
    ])
  );

  const availableRequests = state.requests.filter(
    (r) =>
      r.status === 'open' &&
      !myJoinedRequestIds.has(r.id) &&
      joinerCounts[r.id] < r.peopleCount
  );

  const filtered = availableRequests.filter((r) => !typeFilter || r.requestType === typeFilter);

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-sm font-bold text-brand-ink uppercase tracking-wider">今晚的局</p>
        <p className="text-xs text-zinc-400 mt-0.5">點擊查看詳情，直接加入</p>
      </div>

      {/* Type filter */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-2 mb-2 scrollbar-hide">
        {TYPE_FILTERS.map((f) => (
          <button
            key={String(f.value)}
            onClick={() => setTypeFilter(f.value)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              typeFilter === f.value ? 'bg-brand-ink text-white' : 'bg-white text-zinc-600 border border-brand-lavender'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#8BD8F1] to-[#F7BEF1] flex items-center justify-center mb-4 shadow-card">
            <span className="text-4xl">🎉</span>
          </div>
          <p className="text-base font-semibold text-brand-ink mb-1">目前沒有可加入的活動</p>
          <p className="text-sm text-zinc-400">稍後再來看看，或試試其他篩選條件</p>
        </div>
      ) : (
        <div className="px-4 flex flex-col gap-3">
          {filtered.map((req) => {
            const creator = state.users.find((u) => u.id === req.creatorId);
            const typeColor = TYPE_COLORS[req.requestType] ?? '#DED9E5';
            const joinedCount = joinerCounts[req.id] ?? 0;
            const slotsLeft = req.peopleCount - joinedCount;

            return (
              <button
                key={req.id}
                onClick={() => router.push(`/requests/${req.id}`)}
                className="w-full bg-white rounded-2xl border border-brand-lavender shadow-card p-4 text-left active:scale-[0.99] transition-all"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-brand-ink" style={{ backgroundColor: typeColor }}>
                    {TYPE_FILTERS.find(f => f.value === req.requestType)?.label ?? req.requestType}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    <MapPin className="w-3 h-3" strokeWidth={1.75} /> {req.area}
                  </span>
                  <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-brand-sky">
                    <Users className="w-3 h-3" strokeWidth={2} /> 還剩 {slotsLeft} 位
                  </span>
                </div>

                <p className="text-sm text-brand-ink line-clamp-2 mb-3 leading-snug">{req.note}</p>

                <div className="flex items-center gap-3">
                  {creator && (
                    <img src={creator.avatarUrl} alt={creator.nickname} className="w-6 h-6 rounded-full object-cover" />
                  )}
                  <span className="text-xs text-zinc-500 flex-1">{creator?.nickname}</span>
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    <Clock className="w-3 h-3" strokeWidth={1.75} />
                    {formatDistanceToNow(new Date(req.createdAt), { locale: zhTW, addSuffix: true })}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
