'use client';

import { useRouter } from 'next/navigation';
import type { Request, User } from '@/lib/mock';
import { useAppState } from '@/lib/state';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { useState } from 'react';
import { RequestHeartSlots } from '@/components/RequestHeartSlots';
import { confirmedCountForRequest } from '@/lib/request-attendance';
import { getRequestTypeLabel, PARTY_FORMAT_LABELS, SHOW_REQUEST_CLASSIFICATION, VENUE_TYPE_LABELS } from '@/lib/utils';

const TYPE_COLORS: Record<string, string> = {
  after_party: '#FF3C91',
  drinking:    '#F59E0B',
  fill_spot:   '#6C2EFF',
  last_minute: '#EF4444',
  music:       '#8BD8F1',
  dancing:     '#6C2EFF',
  private_party: '#FF3C91',
  dining:      '#A8E6CF',
  other:       '#9295A5',
};

interface Props {
  request: Request;
  variant: 'ledger' | 'inbox' | 'sent';
  creator?: User;
  onCancelJoin?: () => void;
}

export function RequestCard({ request, variant, creator, onCancelJoin }: Props) {
  const router = useRouter();
  const { state, closeRequest } = useAppState();
  const [toast, setToast] = useState('');

  const typeColor = TYPE_COLORS[request.requestType] ?? '#9295A5';
  const typeLabel = getRequestTypeLabel(request);

  // Counts for the demand signal row
  const allResponses = state.responses.filter((r) => r.requestId === request.id);
  const joinAskCount = allResponses.filter(
    (r) => r.responseStatus === 'interested' || r.responseStatus === 'joining'
  ).length;
  const joinersCount = allResponses.filter((r) => r.responseStatus === 'joining').length;
  const views = Math.max(
    request.metrics?.views ?? 0,
    request.requestViewers?.length ?? 0
  );
  const showCounts = views > 0 || joinAskCount > 0 || joinersCount > 0;
  const confirmedCount = confirmedCountForRequest(
    request.id,
    state.responses,
    state.invitations,
  );

  function handleClose() {
    closeRequest(request.id);
  }

  return (
    <div className="juga-request-card bg-white rounded-2xl border border-brand-lavender p-4 shadow-card">
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
        {SHOW_REQUEST_CLASSIFICATION && <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: typeColor }}>
          {typeLabel}
        </span>}
        <span className="text-xs text-zinc-500">
          {request.area}{SHOW_REQUEST_CLASSIFICATION && request.venueType ? ` · ${VENUE_TYPE_LABELS[request.venueType] ?? request.venueType}` : ''} · {request.peopleCount} 人
        </span>
        {variant === 'inbox' && joinAskCount > 0 && (
          <span className="ml-auto text-xs font-semibold text-brand-sky">{joinAskCount} 人回應</span>
        )}
      </div>

      {SHOW_REQUEST_CLASSIFICATION && request.partyFormat && (
        <p className="mb-2 text-xs font-semibold text-blue-600">
          {PARTY_FORMAT_LABELS[request.partyFormat] ?? request.partyFormat}
        </p>
      )}

      {/* Row 3: note */}
      <p className="text-sm text-zinc-700 line-clamp-2 mb-2">{request.note}</p>

      <RequestHeartSlots
        total={request.peopleCount}
        confirmed={confirmedCount}
        className="mb-3"
      />

      {/* Row 4: demand signal counts (hidden when all zero) */}
      {showCounts && (
        <p className="text-[11px] text-zinc-500 flex items-center gap-1.5 mb-3">
          {views > 0 && <span>👀 {views} 觀看</span>}
          {views > 0 && joinAskCount > 0 && <span>·</span>}
          {joinAskCount > 0 && <span>🙋 {joinAskCount} 想加入</span>}
          {joinAskCount > 0 && joinersCount > 0 && <span>·</span>}
          {joinersCount > 0 && <span>✅ {joinersCount}/{request.peopleCount} 已加入</span>}
        </p>
      )}

      {/* Row 5: actions */}
      <div className="flex gap-2">
        <button
          onClick={() => router.push(`/requests/${request.id}`)}
          className="flex-1 py-2.5 rounded-xl border border-brand-lavender text-sm font-semibold text-brand-ink bg-white active:bg-brand-snow transition-colors"
        >
          查看
        </button>

        {variant === 'sent' && (
          <button disabled className="flex-1 py-2.5 rounded-xl bg-brand-lavender text-sm font-semibold text-zinc-400">
            等待對方回應 ⏳
          </button>
        )}

        {variant === 'sent' && onCancelJoin && (
          <button
            onClick={onCancelJoin}
            className="flex-1 py-2.5 rounded-xl border border-red-200 text-sm font-semibold text-red-500 bg-red-50 active:bg-red-100 transition-colors"
          >
            取消請求
          </button>
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
