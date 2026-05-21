'use client';

import { useState } from 'react';
import { useAppState } from '@/lib/state';
import { RequestCard } from '@/components/RequestCard';
import { PostRequestSheet } from '@/components/PostRequestSheet';

const TYPE_FILTERS = [
  { value: null, label: '全部' },
  { value: 'after_party', label: 'After Party' },
  { value: 'drinking', label: '喝一杯' },
  { value: 'fill_spot', label: '補位' },
  { value: 'last_minute', label: '臨時局' },
  { value: 'other', label: '其他' },
];

export default function RequestsPage() {
  const { state } = useAppState();
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const openRequests = state.requests.filter(
    (r) => r.status === 'open' && r.creatorId !== state.currentUserId
  );

  const filtered = openRequests.filter((r) => {
    const matchType = !typeFilter || r.requestType === typeFilter;
    const matchArea = !areaFilter || r.area === areaFilter;
    return matchType && matchArea;
  });

  function getCreator(creatorId: string) {
    return state.users.find((u) => u.id === creatorId);
  }

  return (
    <div className="px-4 py-3">
      {/* Type filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
        {TYPE_FILTERS.map((f) => (
          <button
            key={String(f.value)}
            onClick={() => setTypeFilter(f.value)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              typeFilter === f.value
                ? 'bg-brand-ink text-white'
                : 'bg-white text-zinc-600 border border-brand-lavender'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-3xl bg-gradient-card-b flex items-center justify-center mb-4 shadow-card">
            <span className="text-4xl">🎉</span>
          </div>
          <p className="text-base font-semibold text-brand-ink mb-1">目前沒有公開需求</p>
          <p className="text-sm text-zinc-400 mb-4">成為第一個發布需求的人</p>
          <button
            onClick={() => setSheetOpen(true)}
            className="px-6 py-2.5 rounded-2xl bg-brand-sky text-brand-ink font-semibold text-sm active:scale-95 transition-transform"
          >
            發布需求
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              variant="ledger"
              creator={getCreator(req.creatorId)}
            />
          ))}
        </div>
      )}

      <PostRequestSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
