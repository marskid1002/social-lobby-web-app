'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { RequestCard } from '@/components/RequestCard';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { MapPin, Clock, Users } from 'lucide-react';
import { RequestHeartSlots } from '@/components/RequestHeartSlots';
import { confirmedCountForRequest } from '@/lib/request-attendance';
import { PARTY_FORMAT_LABELS, REQUEST_TYPE_LABELS, SHOW_REQUEST_CLASSIFICATION, VENUE_TYPE_LABELS } from '@/lib/utils';

const TYPE_FILTERS = [
  { value: null,          label: '全部' },
  { value: 'drinking',    label: '喝酒' },
  { value: 'music',       label: '音樂' },
  { value: 'dancing',     label: '跳舞' },
  { value: 'private_party', label: '私人派對' },
  { value: 'dining',      label: '吃飯' },
];

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

type EscortTab = 'area' | 'all' | 'sent';

export default function RequestsPage() {
  const { state, currentUser, joinRequest, cancelJoinRequest } = useAppState();
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [escortTab, setEscortTab] = useState<EscortTab>('area');
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());

  const role = currentUser?.role;
  const isEscort = role === 'escort';

  // Regular users go home; operators/managers and escorts stay
  useEffect(() => {
    if (role === 'user') router.replace('/lobby/explore');
  }, [role, router]);

  if (role === 'user') return null;

  // ── Manager view ────────────────────────────────────────────────
  if (role === 'manager') {
    const now = Date.now();
    const openRequests = state.requests.filter(
      (r) => r.status === 'open'
        && new Date(r.expiresAt).getTime() > now
        && r.creatorId !== state.currentUserId
    );
    const filtered = openRequests.filter((r) => !typeFilter || r.requestType === typeFilter);
    return (
      <div className="px-4 py-3">
        {SHOW_REQUEST_CLASSIFICATION && <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
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
        </div>}
        <div className="flex flex-col gap-3">
          {filtered.map((req) => (
            <RequestCard key={req.id} request={req} variant="ledger" creator={state.users.find((u) => u.id === req.creatorId)} />
          ))}
          {filtered.length === 0 && <div className="text-center py-16 text-zinc-400 text-sm">目前沒有公開需求</div>}
        </div>
      </div>
    );
  }

  // ── Escort view ──────────────────────────────────────────────────────────
  const myArea = currentUser?.defaultArea ?? '信義區';
  const now = new Date();

  // Requests this escort has already submitted a response for
  const myRespondedRequestIds = new Set(
    state.responses
      .filter((r) => r.userId === state.currentUserId &&
        (r.responseStatus === 'interested' || r.responseStatus === 'joining'))
      .map((r) => r.requestId)
  );

  // Base: open, not expired, not created by escort herself
  const baseRequests = state.requests.filter(
    (r) => r.status === 'open' &&
           new Date(r.expiresAt) > now &&
           confirmedCountForRequest(r.id, state.responses, state.invitations) < r.peopleCount &&
           r.creatorId !== state.currentUserId
  );

  // Compute joiner counts for cap filtering
  const joinerCounts = Object.fromEntries(
    baseRequests.map((r) => [
      r.id,
      confirmedCountForRequest(r.id, state.responses, state.invitations),
    ])
  );

  // Browseable = not yet responded to（#5 派工無上限：不再以 peopleCount 篩掉額滿的局）
  const browseable = baseRequests.filter(
    (r) => !myRespondedRequestIds.has(r.id)
  );

  const areaRequests = browseable.filter((r) => r.area === myArea);
  const allRequests  = browseable;

  // Sent requests (awaiting or accepted)
  const sentRequests = baseRequests.filter((r) => myRespondedRequestIds.has(r.id));

  const activeList = escortTab === 'area' ? areaRequests
    : escortTab === 'all'  ? allRequests
    : sentRequests;

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <p className="text-sm font-bold text-brand-ink uppercase tracking-wider">今晚的局</p>
      </div>

      {/* 3-chip tab bar */}
      <div className="flex gap-2 px-4 mb-3">
        {([
          { key: 'area', label: `我的區域` },
          { key: 'all',  label: '全部區域' },
          { key: 'sent', label: `我送出的請求${sentRequests.length > 0 ? ` (${sentRequests.length})` : ''}` },
        ] as { key: EscortTab; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setEscortTab(tab.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              escortTab === tab.key ? 'bg-brand-ink text-white' : 'bg-white text-zinc-600 border border-brand-lavender'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4 shadow-card" style={{ background: 'var(--juga-brand-gradient)' }}>
            <span className="text-3xl">{escortTab === 'sent' ? '⏳' : '🎉'}</span>
          </div>
          <p className="text-sm font-semibold text-brand-ink mb-1">
            {escortTab === 'sent' ? '還沒有送出請求' : escortTab === 'area' ? `${myArea}目前沒有開放邀請` : '目前沒有開放邀請'}
          </p>
          <p className="text-xs text-zinc-400">
            {escortTab === 'area' ? '試試切換到全部區域 👀' : escortTab === 'sent' ? '找一個喜歡的局，送出加入請求' : '稍後再來看看'}
          </p>
          {escortTab === 'area' && (
            <button onClick={() => setEscortTab('all')} className="mt-3 px-4 py-2 rounded-xl bg-brand-ice text-brand-ink text-xs font-semibold border border-brand-lavender">
              切換到全部區域
            </button>
          )}
        </div>
      ) : (
        <div className="px-4 flex flex-col gap-3">
          {activeList.map((req) => {
            if (escortTab === 'sent') {
              const myResp = state.responses.find(
                (r) => r.requestId === req.id && r.userId === state.currentUserId
              );
              return (
                <RequestCard
                  key={req.id}
                  request={req}
                  creator={state.users.find((u) => u.id === req.creatorId)}
                  variant={myResp?.responseStatus === 'joining' ? 'ledger' : 'sent'}
                  onCancelJoin={myResp?.responseStatus === 'interested' ? () => cancelJoinRequest(req.id) : undefined}
                />
              );
            }

            const creator = state.users.find((u) => u.id === req.creatorId);
            const typeColor = TYPE_COLORS[req.requestType] ?? '#9295A5';
            const slotsLeft = req.peopleCount - (joinerCounts[req.id] ?? 0);

            return (
              <div
                key={req.id}
                className="juga-request-card w-full bg-white rounded-2xl border border-brand-lavender shadow-card p-4 text-left"
              >
                <button onClick={() => router.push(`/requests/${req.id}`)} className="w-full text-left">
                  <div className="flex items-center gap-2 mb-2">
                    {SHOW_REQUEST_CLASSIFICATION && <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: typeColor }}>
                      {REQUEST_TYPE_LABELS[req.requestType] ?? req.requestType}
                    </span>}
                    <span className="flex items-center gap-1 text-xs text-zinc-400">
                      <MapPin className="w-3 h-3" strokeWidth={1.75} /> {req.area}{SHOW_REQUEST_CLASSIFICATION && req.venueType ? ` · ${VENUE_TYPE_LABELS[req.venueType] ?? req.venueType}` : ''}
                    </span>
                    <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-brand-sky">
                      <Users className="w-3 h-3" strokeWidth={2} /> 還剩 {slotsLeft} 位
                    </span>
                  </div>
                  {SHOW_REQUEST_CLASSIFICATION && req.partyFormat && (
                    <p className="mb-2 text-xs font-semibold text-blue-600">
                      {PARTY_FORMAT_LABELS[req.partyFormat] ?? req.partyFormat}
                    </p>
                  )}
                  <p className="text-sm text-brand-ink line-clamp-2 mb-3 leading-snug">{req.note}</p>
                  <RequestHeartSlots
                    total={req.peopleCount}
                    confirmed={joinerCounts[req.id] ?? 0}
                    className="mb-3"
                  />
                  <div className="flex items-center gap-3 mb-3">
                    {creator && <img src={creator.avatarUrl} alt={creator.nickname} className="w-6 h-6 rounded-full object-cover" />}
                    <span className="text-xs text-zinc-500 flex-1">{creator?.nickname}</span>
                    <span className="flex items-center gap-1 text-xs text-zinc-400">
                      <Clock className="w-3 h-3" strokeWidth={1.75} />
                      {formatDistanceToNow(new Date(req.createdAt), { locale: zhTW, addSuffix: true })}
                    </span>
                  </div>
                </button>

                {/* Quick-join CTA */}
                {joinedIds.has(req.id) ? (
                  <div className="flex items-center justify-center py-2.5 rounded-2xl bg-brand-lavender/40">
                    <span className="text-xs font-semibold text-zinc-500">已送出請求 ⏳</span>
                  </div>
                ) : (
                  <div style={{ background: 'var(--juga-brand-gradient)', padding: '1.5px', borderRadius: '14px' }}>
                    <button
                      onClick={() => { joinRequest(req.id); setJoinedIds((prev) => new Set([...prev, req.id])); }}
                      className="w-full py-2.5 rounded-[12px] bg-white text-sm font-bold text-brand-ink active:bg-brand-snow transition-colors"
                    >
                      請求加入 ✨
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
