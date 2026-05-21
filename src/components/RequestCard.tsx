'use client';

import { useRouter } from 'next/navigation';
import type { Request, User } from '@/lib/mock';
import { useAppState } from '@/lib/state';
import { formatDistanceToNow } from 'date-fns';
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

interface Props {
  request: Request;
  variant: 'ledger' | 'inbox';
  creator?: User;
}

export function RequestCard({ request, variant, creator }: Props) {
  const router = useRouter();
  const { state, respondToRequest, closeRequest } = useAppState();
  const [toast, setToast] = useState('');

  const hasResponded = state.responses.some(
    (r) => r.requestId === request.id && r.userId === state.currentUserId
  );

  const responseCount = state.responses.filter((r) => r.requestId === request.id).length;

  function handleRespond() {
    respondToRequest(request.id);
    setToast('已表示興趣');
    setTimeout(() => setToast(''), 2000);
  }

  function handleClose() {
    closeRequest(request.id);
  }

  const typeColor = TYPE_COLORS[request.requestType] ?? '#DED9E5';
  const typeLabel = TYPE_LABELS[request.requestType] ?? request.requestType;

  return (
    <div className="bg-white rounded-2xl border border-brand-lavender p-4 shadow-card">
      {/* Row 1: creator + time */}
      <div className="flex items-center gap-2 mb-2">
        {creator && (
          <button onClick={() => router.push(`/u/${creator.id}`)} className="shrink-0">
            <img src={creator.avatarUrl} alt={creator.nickname} className="w-8 h-8 rounded-full object-cover" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          {creator && <p className="text-sm font-semibold text-brand-ink truncate">{creator.nickname}</p>}
        </div>
        <span className="text-xs text-zinc-400 shrink-0">
          {formatDistanceToNow(new Date(request.createdAt), { locale: zhTW, addSuffix: true })}
        </span>
      </div>

      {/* Row 2: type badge + meta */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-brand-ink"
          style={{ backgroundColor: typeColor }}
        >
          {typeLabel}
        </span>
        <span className="text-xs text-zinc-500">{request.area} · {request.peopleCount} 人</span>
        {variant === 'inbox' && responseCount > 0 && (
          <span className="ml-auto text-xs font-semibold text-brand-sky">{responseCount} 人回應</span>
        )}
      </div>

      {/* Row 3: note */}
      <p className="text-sm text-zinc-700 line-clamp-2 mb-3">{request.note}</p>

      {/* Row 4: actions */}
      <div className="flex gap-2">
        <button
          onClick={() => router.push(`/requests/${request.id}`)}
          className="flex-1 py-2.5 rounded-xl border border-brand-lavender text-sm font-semibold text-brand-ink bg-white active:bg-brand-snow transition-colors"
        >
          查看
        </button>
        {variant === 'ledger' && (
          hasResponded ? (
            <button disabled className="flex-1 py-2.5 rounded-xl bg-brand-lavender text-sm font-semibold text-zinc-400">
              已回應
            </button>
          ) : (
            <button
              onClick={handleRespond}
              className="flex-1 py-2.5 rounded-xl bg-brand-sky text-sm font-semibold text-brand-ink active:scale-[0.98] transition-all"
            >
              我想加入
            </button>
          )
        )}
        {variant === 'inbox' && (
          <button
            onClick={handleClose}
            className="flex-1 py-2.5 rounded-xl border border-red-200 text-sm font-semibold text-red-500 bg-white active:bg-red-50 transition-colors"
          >
            關閉需求
          </button>
        )}
      </div>

      {toast && (
        <div className="mt-2 text-center text-xs text-brand-sky font-semibold">{toast}</div>
      )}
    </div>
  );
}
