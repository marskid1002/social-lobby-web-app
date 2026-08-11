'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Account = {
  key: string;
  accountRef: string;
  role: 'user' | 'manager' | 'account_admin' | 'admin';
  tier: string;
  userId: string;
  nickname: string;
  hasPassword: boolean;
  disabled: boolean;
  archived?: boolean;
  hasActivationCode?: boolean;
  activationCreatedAt?: string;
  createdAt: string;
};

type Report = {
  id: string;
  reporterId: string;
  targetId: string;
  targetName?: string;
  reason: string;
  createdAt: string;
  resolved: boolean;
};

type IssueReport = {
  id: string;
  reporterId: string;
  description: string;
  page: string;
  requestId?: string;
  threadId?: string;
  traceId?: string;
  lastErrorCode?: string;
  userAgent: string;
  createdAt: string;
  resolved: boolean;
};

type FlowStep = {
  key: string;
  label: string;
  state: 'done' | 'waiting' | 'error';
  at?: string;
};

type Flow = {
  requestId: string;
  creatorId: string;
  creatorName: string;
  area: string;
  requestType: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  responseCount: number;
  joiningCount: number;
  chatCount: number;
  messageCount: number;
  health: 'healthy' | 'waiting' | 'error';
  issue: string;
  steps: FlowStep[];
};

type Conversation = {
  key: string;
  threadId: string;
  requestId: string | null;
  participants: string[];
  participantNames: string[];
  messageCount: number;
  lastAt: string;
  lastPreview: string;
};

type ConversationMessage = {
  id: string;
  senderId: string;
  text: string;
  imageUrl?: string;
  createdAt: string;
};

type AuditRecord = {
  id: string;
  adminUserId: string;
  action: string;
  target?: string;
  detail?: string;
  createdAt: string;
};

type TraceEvent = {
  id: string;
  traceId: string;
  eventType: string;
  outcome: 'success' | 'failure' | 'skipped';
  createdAt: string;
  actorUserId?: string;
  requestId?: string;
  threadId?: string;
  entityId?: string;
  code?: string;
  detail?: string;
};

type DeviceSummary = {
  userId: string;
  count: number;
  lastSeenAt?: string;
  userAgents: string[];
};

type RosterMember = {
  id: string;
  nickname: string;
  createdAt: string;
  removed: boolean;
  status: 'online' | 'offline' | 'busy' | 'removed';
};

type ManagerRoster = {
  managerId: string;
  activeCount: number;
  removedCount: number;
  totalCreated: number;
  members: RosterMember[];
};

type SystemStatus = {
  ready: boolean;
  redisConfigured: boolean;
  redisPing: boolean;
  sessionSecretConfigured: boolean;
  smsConfigured: boolean;
  pushConfigured: boolean;
  blobConfigured: boolean;
  sentryConfigured: boolean;
  keyPrefix: string;
  version: string;
};

type DashboardData = {
  accounts: Account[];
  reports: Report[];
  dashboard: {
    overview: {
      accounts: number;
      customers: number;
      managers: number;
      disabledAccounts: number;
      openRequests: number;
      activeChats: number;
      messages: number;
      pendingReports: number;
      brokenFlows: number;
    };
    flows: Flow[];
    conversations: Conversation[];
  };
  system: SystemStatus;
  auditLogs: AuditRecord[];
  traceEvents: TraceEvent[];
  issues: IssueReport[];
  devices: DeviceSummary[];
  managerRosters: ManagerRoster[];
};

type Tab = 'overview' | 'flows' | 'accounts' | 'reports' | 'chats' | 'system' | 'danger';

const NAV: Array<{ id: Tab; label: string; short: string }> = [
  { id: 'overview', label: '營運總覽', short: '總覽' },
  { id: 'flows', label: '流程診斷', short: '流程' },
  { id: 'accounts', label: '帳號管理', short: '帳號' },
  { id: 'reports', label: '檢舉中心', short: '檢舉' },
  { id: 'chats', label: '聊天室查詢', short: '聊天' },
  { id: 'system', label: '系統狀態', short: '系統' },
  { id: 'danger', label: '危險操作', short: '維護' },
];

const ROLE_LABEL: Record<string, string> = {
  admin: '管理員',
  account_admin: '幹部帳號管理員',
  manager: '幹部',
  user: '客戶',
};

const ROSTER_STATUS: Record<RosterMember['status'], { label: string; className: string }> = {
  online: { label: '上班中', className: 'bg-emerald-50 text-emerald-700' },
  offline: { label: '離線', className: 'bg-zinc-100 text-zinc-500' },
  busy: { label: '忙碌中', className: 'bg-pink-50 text-pink-700' },
  removed: { label: '已移除', className: 'bg-red-50 text-red-600' },
};

const REQUEST_TYPE_LABEL: Record<string, string> = {
  after_party: 'After Party',
  drinking: '喝酒',
  fill_spot: '臨時補位',
  last_minute: '臨時約會',
  music: '音樂',
  dancing: '跳舞',
  private_party: '私人派對',
  dining: '吃飯',
  other: '其他',
};

const ACTION_LABEL: Record<string, string> = {
  reset: '重設密碼',
  disable: '停用帳號',
  enable: '啟用帳號',
  delete: '刪除帳號',
  'resolve-report': '完成檢舉',
  'reopen-report': '重開檢舉',
  'resolve-issue': '完成問題回報',
  'reopen-issue': '重開問題回報',
  'clear-shared': '清除局與聊天資料',
  'reset-all-managers': '清空所有幹部密碼',
  'delete-all-customers': '刪除所有客戶',
};

const TRACE_LABEL: Record<string, string> = {
  'request.created': '客戶發局已儲存',
  'response.created': '使用者回應已儲存',
  'dispatch.created': '幹部派工已儲存',
  'match.accepted': '客戶同意入局',
  'chat.created': '聊天室已建立',
  'chat.push': '聊天室通知',
  'notification.opened': '通知連結已開啟',
  'chat.entered': '已進入聊天室',
  'message.stored': '訊息已儲存',
  'message.push': '訊息通知',
  'issue.reported': '問題已回報',
};

const fmtTime = (iso?: string) => {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '時間異常';
  return parsed.toLocaleString('zh-Hant-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />;
}

function MetricCard({ label, value, alert = false }: { label: string; value: number | string; alert?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${alert ? 'border-red-200 bg-red-50' : 'border-zinc-200 bg-white'}`}>
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${alert ? 'text-red-600' : 'text-zinc-900'}`}>{value}</p>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [flowOpen, setFlowOpen] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, ConversationMessage[]>>({});
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [oneTimeSecret, setOneTimeSecret] = useState<{ key: string; value: string; label: string } | null>(null);
  const [newManagerName, setNewManagerName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState('');
  const [rosterOpen, setRosterOpen] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  };

  const load = useCallback(async () => {
    setError('');
    const response = await fetch('/api/admin', { cache: 'no-store' });
    if (response.status === 401 || response.status === 403) {
      setError('此後台僅限 A000 管理者帳號');
      setData(null);
      return;
    }
    if (!response.ok) {
      setError('後台資料載入失敗');
      return false;
    }
    setData(await response.json() as DashboardData);
    setLastRefreshedAt(new Date().toISOString());
    return true;
  }, []);

  useEffect(() => {
    load().catch(() => setError('後台資料載入失敗'));
  }, [load]);

  async function refreshDashboard() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const ok = await load();
      if (ok) showToast('後台資料已更新');
    } catch {
      showToast('重新整理失敗，請確認網路後再試');
    } finally {
      setRefreshing(false);
    }
  }

  const accountName = useCallback((userId: string) =>
    data?.accounts.find((account) => account.userId === userId)?.nickname || userId,
  [data?.accounts]);

  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!data) return [];
    if (!query) return data.accounts;
    return data.accounts.filter((account) =>
      [account.key, account.nickname, account.userId, ROLE_LABEL[account.role]]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    );
  }, [data, search]);

  const filteredFlows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!data) return [];
    if (!query) return data.dashboard.flows;
    return data.dashboard.flows.filter((flow) =>
      [flow.requestId, flow.creatorName, flow.creatorId, flow.area, flow.issue]
        .some((value) => value.toLowerCase().includes(query))
      || data.traceEvents.some((event) =>
        event.requestId === flow.requestId
        && [event.traceId, event.threadId, event.actorUserId, event.entityId, event.code]
          .some((value) => value?.toLowerCase().includes(query))
      )
    );
  }, [data, search]);

  const filteredChats = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!data) return [];
    if (!query) return data.dashboard.conversations;
    return data.dashboard.conversations.filter((conversation) =>
      [
        conversation.threadId,
        conversation.requestId ?? '',
        conversation.participantNames.join(' '),
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [data, search]);

  async function runAction(
    action: string,
    input: {
      account?: string;
      reportId?: string;
      issueId?: string;
      confirmation?: string;
      nickname?: string;
    } = {},
  ) {
    setBusy(`${action}:${input.account ?? input.reportId ?? input.issueId ?? ''}`);
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...input }),
      });
      const result = await response.json().catch(() => ({})) as {
        ok?: boolean;
        error?: string;
        count?: number;
        tempPassword?: string;
        activationCode?: string;
        account?: string;
      };
      if (!response.ok || !result.ok) {
        showToast(result.error || '操作失敗');
        return false;
      }
      if (result.tempPassword && input.account) {
        setOneTimeSecret({ key: input.account, value: result.tempPassword, label: '臨時密碼' });
      } else if (result.activationCode && result.account) {
        setOneTimeSecret({ key: result.account, value: result.activationCode, label: '一次性啟用碼' });
      } else if (typeof result.count === 'number') {
        showToast(`已完成，共處理 ${result.count} 筆`);
      } else {
        showToast('操作已完成');
      }
      await load();
      return true;
    } catch {
      showToast('連線失敗');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function loadConversation(conversation: Conversation) {
    if (chatOpen === conversation.key) {
      setChatOpen(null);
      return;
    }
    setChatOpen(conversation.key);
    if (chatMessages[conversation.key]) return;
    setBusy(`chat:${conversation.key}`);
    try {
      const query = new URLSearchParams({ threadId: conversation.threadId });
      if (conversation.requestId !== null) query.set('requestId', conversation.requestId);
      const response = await fetch(`/api/admin?${query}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({})) as {
        messages?: ConversationMessage[];
        error?: string;
      };
      if (!response.ok) {
        showToast(result.error || '對話載入失敗');
        return;
      }
      setChatMessages((current) => ({
        ...current,
        [conversation.key]: result.messages ?? [],
      }));
    } catch {
      showToast('對話載入失敗');
    } finally {
      setBusy('');
    }
  }

  function runDanger(action: string, expected: string) {
    const typed = window.prompt(`此操作無法復原。\n請輸入：${expected}`);
    if (typed === null) return;
    if (typed !== expected) {
      showToast('確認文字不正確，已取消');
      return;
    }
    runAction(action, { confirmation: typed });
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-100 px-5">
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-xl">
          <p className="text-base font-bold text-red-600">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="mt-5 rounded-xl bg-sky-400 px-5 py-2.5 text-sm font-bold text-zinc-900"
          >
            前往登入
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-100">
        <p className="text-sm font-semibold text-zinc-500">管理後台載入中…</p>
      </div>
    );
  }

  const overview = data.dashboard.overview;
  const problemFlows = data.dashboard.flows.filter((flow) => flow.health === 'error').slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-zinc-100 text-zinc-900">
      <header className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-4 md:px-6">
        <div>
          <p className="text-lg font-bold">Social Lobby 管理後台</p>
          <p className="text-[11px] text-zinc-400">
            A000 · 正式營運與流程診斷
            {lastRefreshedAt && ` · 更新於 ${fmtTime(lastRefreshedAt)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={refreshing}
            onClick={refreshDashboard}
            className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-60"
          >
            {refreshing ? '整理中…' : '重新整理'}
          </button>
          <button
            onClick={() => router.push('/lobby/explore')}
            className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white"
          >
            回前台
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100dvh_-_4rem)]">
        <aside className="hidden w-56 shrink-0 border-r border-zinc-200 bg-white p-3 md:block">
          <nav className="space-y-1">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => { setTab(item.id); setSearch(''); }}
                className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${
                  tab === item.id ? 'bg-sky-100 text-sky-800' : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                {item.label}
                {item.id === 'flows' && overview.brokenFlows > 0 && (
                  <span className="float-right rounded-full bg-red-500 px-2 py-0.5 text-[10px] text-white">
                    {overview.brokenFlows}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto pb-24 md:pb-8">
          <div className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-zinc-200 bg-white px-3 py-2 md:hidden">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => { setTab(item.id); setSearch(''); }}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  tab === item.id ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'
                }`}
              >
                {item.short}
              </button>
            ))}
          </div>

          <div className="mx-auto max-w-7xl p-4 md:p-6">
            {tab === 'overview' && (
              <section>
                <div className="mb-5 flex items-end justify-between">
                  <div>
                    <h1 className="text-2xl font-bold">營運總覽</h1>
                    <p className="mt-1 text-sm text-zinc-500">快速掌握帳號、局、聊天室與異常流程。</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                    data.system.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {data.system.ready ? '系統正常' : '系統異常'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                  <MetricCard label="全部帳號" value={overview.accounts} />
                  <MetricCard label="客戶／幹部" value={`${overview.customers} / ${overview.managers}`} />
                  <MetricCard label="進行中的局" value={overview.openRequests} />
                  <MetricCard label="有效聊天室" value={overview.activeChats} />
                  <MetricCard label="聊天室訊息" value={overview.messages} />
                  <MetricCard label="待處理檢舉" value={overview.pendingReports} alert={overview.pendingReports > 0} />
                  <MetricCard label="停用帳號" value={overview.disabledAccounts} />
                  <MetricCard label="異常流程" value={overview.brokenFlows} alert={overview.brokenFlows > 0} />
                </div>

                <div className="mt-6 rounded-2xl border border-zinc-200 bg-white">
                  <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
                    <h2 className="font-bold">需要注意的流程</h2>
                    <button onClick={() => setTab('flows')} className="text-xs font-semibold text-sky-600">查看全部</button>
                  </div>
                  {problemFlows.length === 0 ? (
                    <p className="p-5 text-sm text-emerald-600">目前沒有偵測到聊天室流程異常。</p>
                  ) : (
                    problemFlows.map((flow) => (
                      <button
                        key={flow.requestId}
                        onClick={() => { setTab('flows'); setFlowOpen(flow.requestId); }}
                        className="flex w-full items-center gap-3 border-b border-zinc-100 px-4 py-3 text-left last:border-0 hover:bg-zinc-50"
                      >
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{flow.creatorName} · {flow.area || '未填地區'}</p>
                          <p className="truncate text-xs text-red-600">{flow.issue}</p>
                        </div>
                        <span className="text-xs text-zinc-400">{fmtTime(flow.createdAt)}</span>
                      </button>
                    ))
                  )}
                </div>
              </section>
            )}

            {tab === 'flows' && (
              <section>
                <h1 className="text-2xl font-bold">流程診斷</h1>
                <p className="mt-1 text-sm text-zinc-500">伺服器真實事件時間軸，搭配既有資料檢查卡住的步驟。</p>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜尋 traceId、局、聊天室、帳號、地區或錯誤原因"
                  className="mt-4 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-400"
                />
                <div className="mt-4 space-y-3">
                  {filteredFlows.map((flow) => {
                    const isOpen = flowOpen === flow.requestId;
                    const traceEvents = data.traceEvents
                      .filter((event) => event.requestId === flow.requestId)
                      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
                    const traceId = traceEvents[0]?.traceId;
                    return (
                      <div key={flow.requestId} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                        <button
                          onClick={() => setFlowOpen(isOpen ? null : flow.requestId)}
                          className="flex w-full items-center gap-3 p-4 text-left hover:bg-zinc-50"
                        >
                          <span className={`h-3 w-3 shrink-0 rounded-full ${
                            flow.health === 'healthy'
                              ? 'bg-emerald-500'
                              : flow.health === 'error' ? 'bg-red-500' : 'bg-amber-400'
                          }`} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold">
                              {flow.creatorName} · {REQUEST_TYPE_LABEL[flow.requestType] ?? flow.requestType}
                            </p>
                            <p className={`truncate text-xs ${flow.health === 'error' ? 'text-red-600' : 'text-zinc-500'}`}>
                              {flow.issue}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-zinc-500">{flow.area || '未填地區'}</p>
                            <p className="text-[11px] text-zinc-400">{fmtTime(flow.createdAt)}</p>
                          </div>
                        </button>
                        {isOpen && (
                          <div className="border-t border-zinc-100 bg-zinc-50 p-4">
                            <div className="grid gap-2 text-xs text-zinc-500 sm:grid-cols-2 lg:grid-cols-4">
                              <p>局編號：<span className="font-mono text-zinc-800">{flow.requestId}</span></p>
                              <p>Trace：<span className="font-mono text-zinc-800">{traceId ?? '尚無真實紀錄'}</span></p>
                              <p>狀態：<span className="text-zinc-800">{flow.status}</span></p>
                              <p>回應／同意：<span className="text-zinc-800">{flow.responseCount} / {flow.joiningCount}</span></p>
                              <p>聊天室／訊息：<span className="text-zinc-800">{flow.chatCount} / {flow.messageCount}</span></p>
                            </div>
                            <div className="mt-4 grid gap-2 sm:grid-cols-5">
                              {flow.steps.map((step, index) => (
                                <div key={step.key} className="relative rounded-xl border border-zinc-200 bg-white p-3">
                                  <p className="text-[10px] font-bold text-zinc-400">步驟 {index + 1}</p>
                                  <p className="mt-1 text-xs font-semibold">{step.label}</p>
                                  <p className={`mt-2 text-[11px] font-bold ${
                                    step.state === 'done'
                                      ? 'text-emerald-600'
                                      : step.state === 'error' ? 'text-red-600' : 'text-amber-600'
                                  }`}>
                                    {step.state === 'done' ? '成功' : step.state === 'error' ? '失敗' : '等待中'}
                                  </p>
                                  <p className="mt-1 text-[10px] text-zinc-400">{fmtTime(step.at)}</p>
                                </div>
                              ))}
                            </div>
                            <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3">
                              <p className="text-xs font-bold text-zinc-700">伺服器事件時間軸</p>
                              {traceEvents.length === 0 ? (
                                <p className="mt-2 text-xs text-zinc-400">這筆局建立於追蹤功能上線前，尚無事件紀錄。</p>
                              ) : (
                                <div className="mt-2 space-y-2">
                                  {traceEvents.map((event) => (
                                    <div key={event.id} className="flex flex-col gap-1 border-l-2 border-zinc-200 pl-3 text-xs sm:flex-row sm:items-center">
                                      <span className={`font-bold ${
                                        event.outcome === 'failure'
                                          ? 'text-red-600'
                                          : event.outcome === 'skipped' ? 'text-amber-600' : 'text-emerald-600'
                                      }`}>
                                        {TRACE_LABEL[event.eventType] ?? event.eventType}
                                      </span>
                                      <span className="text-zinc-400">{fmtTime(event.createdAt)}</span>
                                      {event.actorUserId && <span className="text-zinc-500">操作者：{accountName(event.actorUserId)}</span>}
                                      {event.threadId && <span className="font-mono text-zinc-400">{event.threadId}</span>}
                                      {event.code && <span className="text-amber-600">{event.code}</span>}
                                      {event.detail && <span className="text-zinc-400">{event.detail}</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {filteredFlows.length === 0 && (
                    <p className="rounded-2xl bg-white p-6 text-center text-sm text-zinc-400">找不到符合的流程。</p>
                  )}
                </div>
              </section>
            )}

            {tab === 'accounts' && (
              <section>
                <h1 className="text-2xl font-bold">帳號管理</h1>
                <p className="mt-1 text-sm text-zinc-500">A000、幹部與客戶帳號集中管理。</p>
                <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
                  <p className="text-sm font-bold text-sky-900">新增幹部帳號</p>
                  <p className="mt-1 text-xs text-sky-700">帳號由伺服器配置；一次性啟用碼只顯示一次。</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={newManagerName}
                      onChange={(event) => setNewManagerName(event.target.value.slice(0, 60))}
                      placeholder="幹部顯示名稱"
                      className="min-w-0 flex-1 rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                    />
                    <button
                      disabled={Boolean(busy) || !newManagerName.trim()}
                      onClick={async () => {
                        const success = await runAction('create-manager', { nickname: newManagerName.trim() });
                        if (success) setNewManagerName('');
                      }}
                      className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                    >
                      建立幹部
                    </button>
                  </div>
                </div>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜尋帳號、暱稱或 userId"
                  className="mt-4 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-400"
                />
                <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                  {filteredAccounts.map((account) => {
                    const roster = data.managerRosters.find((item) => item.managerId === account.userId);
                    const isRosterOpen = rosterOpen === account.userId;
                    return (
                    <div key={account.userId} className="border-b border-zinc-100 p-4 last:border-0">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold">{account.nickname}</p>
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold">
                            {ROLE_LABEL[account.role]}
                          </span>
                          {account.disabled && <span className="text-xs font-bold text-red-600">已停用</span>}
                          {account.archived && <span className="text-xs font-bold text-zinc-600">已封存</span>}
                          {!account.hasPassword && (
                            <span className="text-xs font-bold text-amber-600">
                              {account.hasActivationCode ? '待啟用' : '未設密碼'}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">{account.key} · {account.userId}</p>
                        <p className="mt-1 text-xs text-zinc-400">
                          裝置：{data.devices.find((device) => device.userId === account.userId)?.count ?? 0}
                          {' · '}
                          最近登入：{fmtTime(data.devices.find((device) => device.userId === account.userId)?.lastSeenAt)}
                        </p>
                        {account.role === 'manager' && roster && (
                          <button
                            type="button"
                            onClick={() => setRosterOpen(isRosterOpen ? null : account.userId)}
                            className="mt-2 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-left text-xs font-semibold text-violet-700"
                            aria-expanded={isRosterOpen}
                          >
                            現有人員 {roster.activeCount} 位
                            <span className="ml-1 font-normal text-violet-500">・累計建立 {roster.totalCreated} 位</span>
                            <span className="ml-1">{isRosterOpen ? '收合 ▲' : '查看名單 ▼'}</span>
                          </button>
                        )}
                      </div>
                      {account.role !== 'admin' && (
                        <div className="flex flex-wrap gap-2">
                          {account.role === 'manager' && (
                            <>
                              <button
                                disabled={Boolean(busy)}
                                onClick={() => {
                                  const nickname = window.prompt('新的幹部顯示名稱', account.nickname);
                                  if (nickname?.trim() && nickname.trim() !== account.nickname) {
                                    runAction('edit-manager', { account: account.accountRef, nickname: nickname.trim() });
                                  }
                                }}
                                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold"
                              >
                                編輯名稱
                              </button>
                              <button
                                disabled={Boolean(busy) || Boolean(account.archived)}
                                onClick={() => runAction('regenerate-manager-activation', { account: account.accountRef })}
                                className="rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 disabled:opacity-40"
                              >
                                重發啟用碼
                              </button>
                              <button
                                disabled={Boolean(busy)}
                                onClick={() => runAction(
                                  account.archived ? 'unarchive-manager' : 'archive-manager',
                                  { account: account.accountRef },
                                )}
                                className="rounded-lg border border-zinc-400 px-3 py-1.5 text-xs font-semibold text-zinc-700"
                              >
                                {account.archived ? '取消封存' : '封存'}
                              </button>
                            </>
                          )}
                          <button
                            disabled={Boolean(busy)}
                            onClick={() => runAction('reset', { account: account.accountRef })}
                            className="rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700"
                          >
                            重設密碼
                          </button>
                          <button
                            disabled={Boolean(busy)}
                            onClick={() => runAction(account.disabled ? 'enable' : 'disable', { account: account.accountRef })}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                              account.disabled
                                ? 'border-emerald-300 text-emerald-700'
                                : 'border-amber-300 text-amber-700'
                            }`}
                          >
                            {account.disabled ? '重新啟用' : '停用'}
                          </button>
                          <button
                            disabled={Boolean(busy)}
                            onClick={() => runAction('logout-all-devices', { account: account.accountRef })}
                            className="rounded-lg border border-violet-300 px-3 py-1.5 text-xs font-semibold text-violet-700"
                          >
                            登出所有裝置
                          </button>
                          {(account.role === 'user' || (account.role === 'manager' && !account.hasPassword)) && (
                            <button
                              disabled={Boolean(busy)}
                              onClick={() => { setDeleteTarget(account); setConfirmText(''); }}
                              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600"
                            >
                              永久刪除
                            </button>
                          )}
                        </div>
                      )}
                      </div>
                      {account.role === 'manager' && roster && isRosterOpen && (
                        <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                          {roster.members.length > 0 ? (
                            <div className="space-y-2">
                              {roster.members.map((member) => {
                                const status = ROSTER_STATUS[member.status];
                                return (
                                  <div key={member.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs">
                                    <span className="font-bold text-zinc-800">{member.nickname}</span>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.className}`}>
                                      {status.label}
                                    </span>
                                    <span className="font-mono text-zinc-400">{member.id}</span>
                                    <span className="ml-auto text-zinc-400">建立：{fmtTime(member.createdAt)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-400">這位幹部尚未建立人員。</p>
                          )}
                          {roster.removedCount > 0 && (
                            <p className="mt-2 text-[11px] text-zinc-400">其中 {roster.removedCount} 位已移除，仍保留於累計紀錄。</p>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </section>
            )}

            {tab === 'reports' && (
              <section>
                <h1 className="text-2xl font-bold">回報與檢舉中心</h1>
                <p className="mt-1 text-sm text-zinc-500">流程問題會附上 traceId、頁面與裝置；使用者檢舉可直接處理帳號。</p>
                <h2 className="mt-5 text-sm font-bold text-zinc-800">流程問題回報</h2>
                <div className="mt-3 space-y-3">
                  {[...data.issues]
                    .sort((a, b) => Number(a.resolved) - Number(b.resolved))
                    .map((issue) => (
                      <div key={issue.id} className={`rounded-2xl border bg-white p-4 ${
                        issue.resolved ? 'border-zinc-200 opacity-70' : 'border-sky-200'
                      }`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold">回報人：{accountName(issue.reporterId)}</p>
                            <p className="mt-1 break-all text-xs text-zinc-400">
                              {fmtTime(issue.createdAt)} · {issue.page}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                            issue.resolved ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
                          }`}>
                            {issue.resolved ? '已處理' : '待處理'}
                          </span>
                        </div>
                        <p className="mt-3 rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700">{issue.description}</p>
                        <div className="mt-3 grid gap-1 text-xs text-zinc-500 sm:grid-cols-2">
                          <p>Trace：<span className="break-all font-mono text-zinc-800">{issue.traceId ?? '—'}</span></p>
                          <p>局：<span className="break-all font-mono text-zinc-800">{issue.requestId ?? '—'}</span></p>
                          <p>聊天室：<span className="break-all font-mono text-zinc-800">{issue.threadId ?? '—'}</span></p>
                          <p>錯誤：<span className="break-all text-amber-700">{issue.lastErrorCode ?? '—'}</span></p>
                        </div>
                        <details className="mt-2 text-xs text-zinc-400">
                          <summary className="cursor-pointer">裝置資訊</summary>
                          <p className="mt-1 break-all">{issue.userAgent}</p>
                        </details>
                        <button
                          disabled={Boolean(busy)}
                          onClick={() => runAction(
                            issue.resolved ? 'reopen-issue' : 'resolve-issue',
                            { issueId: issue.id },
                          )}
                          className="mt-3 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold"
                        >
                          {issue.resolved ? '重新開啟' : '標記已處理'}
                        </button>
                      </div>
                    ))}
                  {data.issues.length === 0 && (
                    <p className="rounded-2xl bg-white p-5 text-center text-sm text-zinc-400">目前沒有流程問題回報。</p>
                  )}
                </div>
                <h2 className="mt-6 text-sm font-bold text-zinc-800">使用者檢舉</h2>
                <div className="mt-4 space-y-3">
                  {[...data.reports]
                    .sort((a, b) => Number(a.resolved) - Number(b.resolved))
                    .map((report) => {
                      const target = data.accounts.find((account) => account.userId === report.targetId);
                      return (
                        <div key={report.id} className={`rounded-2xl border bg-white p-4 ${
                          report.resolved ? 'border-zinc-200 opacity-70' : 'border-red-200'
                        }`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold">被檢舉：{report.targetName || accountName(report.targetId)}</p>
                              <p className="mt-1 text-xs text-zinc-400">
                                檢舉人：{accountName(report.reporterId)} · {fmtTime(report.createdAt)}
                              </p>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                              report.resolved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {report.resolved ? '已處理' : '待處理'}
                            </span>
                          </div>
                          <p className="mt-3 rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700">{report.reason || '未填原因'}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              disabled={Boolean(busy)}
                              onClick={() => runAction(report.resolved ? 'reopen-report' : 'resolve-report', { reportId: report.id })}
                              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold"
                            >
                              {report.resolved ? '重新開啟' : '標記已處理'}
                            </button>
                            {target && !target.disabled && target.role !== 'admin' && (
                              <button
                                disabled={Boolean(busy)}
                                onClick={() => runAction('disable', { account: target.accountRef })}
                                className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700"
                              >
                                停用對方
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  {data.reports.length === 0 && (
                    <p className="rounded-2xl bg-white p-6 text-center text-sm text-zinc-400">目前沒有檢舉。</p>
                  )}
                </div>
              </section>
            )}

            {tab === 'chats' && (
              <section>
                <h1 className="text-2xl font-bold">聊天室查詢</h1>
                <p className="mt-1 text-sm text-zinc-500">預設只看摘要；管理者點開後才向伺服器載入內容。</p>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜尋參與者、threadId 或局編號"
                  className="mt-4 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-400"
                />
                <div className="mt-4 space-y-3">
                  {filteredChats.map((conversation) => {
                    const isOpen = chatOpen === conversation.key;
                    const messages = chatMessages[conversation.key];
                    return (
                      <div key={conversation.key} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                        <button
                          onClick={() => loadConversation(conversation)}
                          className="flex w-full items-center gap-3 p-4 text-left hover:bg-zinc-50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold">
                              {conversation.participantNames.join(' ↔ ') || '聊天室'}
                            </p>
                            <p className="truncate text-xs text-zinc-500">
                              {conversation.lastPreview || '沒有文字內容'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold">{conversation.messageCount} 則</p>
                            <p className="text-[10px] text-zinc-400">{fmtTime(conversation.lastAt)}</p>
                          </div>
                        </button>
                        {isOpen && (
                          <div className="max-h-[28rem] overflow-y-auto border-t border-zinc-100 bg-zinc-50 p-4">
                            {busy === `chat:${conversation.key}` && (
                              <p className="text-center text-xs text-zinc-400">載入對話中…</p>
                            )}
                            {messages?.map((message) => (
                              <div key={message.id} className="mb-3 rounded-xl bg-white p-3 last:mb-0">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-bold">{accountName(message.senderId)}</p>
                                  <p className="text-[10px] text-zinc-400">{fmtTime(message.createdAt)}</p>
                                </div>
                                {message.imageUrl ? (
                                  <a
                                    href={message.imageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-2 inline-block text-xs font-semibold text-sky-600"
                                  >
                                    查看照片
                                  </a>
                                ) : (
                                  <p className="mt-1 break-words text-sm text-zinc-700">{message.text}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {filteredChats.length === 0 && (
                    <p className="rounded-2xl bg-white p-6 text-center text-sm text-zinc-400">目前沒有對話。</p>
                  )}
                </div>
              </section>
            )}

            {tab === 'system' && (
              <section>
                <h1 className="text-2xl font-bold">系統狀態</h1>
                <p className="mt-1 text-sm text-zinc-500">只顯示服務是否可用，不顯示任何金鑰內容。</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ['Redis 儲存', data.system.redisConfigured && data.system.redisPing],
                    ['Session 密鑰', data.system.sessionSecretConfigured],
                    ['SMS 簡訊', data.system.smsConfigured],
                    ['Web Push', data.system.pushConfigured],
                    ['Blob 圖片', data.system.blobConfigured],
                    ['Sentry 錯誤追蹤', data.system.sentryConfigured],
                  ].map(([label, ok]) => (
                    <div key={String(label)} className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <div className="flex items-center gap-2">
                        <StatusDot ok={Boolean(ok)} />
                        <p className="text-sm font-bold">{String(label)}</p>
                      </div>
                      <p className={`mt-3 text-xs font-semibold ${ok ? 'text-emerald-600' : 'text-red-600'}`}>
                        {ok ? '正常' : '需要檢查'}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm">
                  <p>正式站版本：<code className="font-mono font-bold">{data.system.version}</code></p>
                  <p className="mt-2">資料環境：<code className="font-mono font-bold">{data.system.keyPrefix}</code></p>
                </div>
                <div className="mt-5 rounded-2xl border border-zinc-200 bg-white">
                  <div className="border-b border-zinc-100 px-4 py-3">
                    <h2 className="font-bold">A000 操作紀錄</h2>
                  </div>
                  {data.auditLogs.length === 0 ? (
                    <p className="p-5 text-sm text-zinc-400">目前沒有後台操作紀錄。</p>
                  ) : (
                    data.auditLogs.map((record) => (
                      <div key={record.id} className="border-b border-zinc-100 px-4 py-3 text-sm last:border-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold">{ACTION_LABEL[record.action] ?? record.action}</p>
                          <p className="text-[11px] text-zinc-400">{fmtTime(record.createdAt)}</p>
                        </div>
                        {(record.target || record.detail) && (
                          <p className="mt-1 text-xs text-zinc-500">
                            {[record.target, record.detail].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            {tab === 'danger' && (
              <section>
                <h1 className="text-2xl font-bold text-red-700">危險操作</h1>
                <p className="mt-1 text-sm text-zinc-500">所有操作不可復原，伺服器會再次驗證確認文字並留下紀錄。</p>
                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-red-200 bg-white p-5">
                    <h2 className="font-bold">清除所有局、聊天與廣場</h2>
                    <p className="mt-2 text-sm text-zinc-500">保留帳號、小姐與照片，清除局、回應、邀請、通知、聊天室、廣場貼文及留言。</p>
                    <p className="mt-2 text-xs font-mono text-red-600">確認文字：CLEAR SHARED</p>
                    <button
                      disabled={Boolean(busy)}
                      onClick={() => runDanger('clear-shared', 'CLEAR SHARED')}
                      className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      清除局與聊天資料
                    </button>
                  </div>
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
                    <h2 className="font-bold text-sky-900">幹部密碼與啟用碼</h2>
                    <p className="mt-2 text-sm text-sky-700">
                      第二階段已停用共用啟用碼與批次清空；請到「帳號管理」對指定幹部重設或重發一次性啟用碼。
                    </p>
                  </div>
                  <div className="rounded-2xl border border-red-300 bg-red-50 p-5">
                    <h2 className="font-bold text-red-800">刪除所有客戶帳號</h2>
                    <p className="mt-2 text-sm text-red-700">連同客戶的局、對話、個人資料與推播訂閱一併刪除。</p>
                    <p className="mt-2 text-xs font-mono text-red-700">確認文字：DELETE CUSTOMERS</p>
                    <button
                      disabled={Boolean(busy)}
                      onClick={() => runDanger('delete-all-customers', 'DELETE CUSTOMERS')}
                      className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      刪除所有客戶
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-bold">永久刪除帳號</h2>
            <p className="mt-2 text-sm text-zinc-500">
              將永久刪除 {deleteTarget.nickname}（{deleteTarget.key}）。
              {deleteTarget.role === 'manager' && ' 若已有任何歷史紀錄，伺服器會拒絕並要求改用封存。'}
            </p>
            <p className="mt-3 text-xs text-zinc-500">請輸入帳號 <b>{deleteTarget.key}</b>：</p>
            <input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl bg-zinc-100 py-2.5 text-sm font-semibold"
              >
                取消
              </button>
              <button
                disabled={confirmText !== deleteTarget.key}
                onClick={async () => {
                  const target = deleteTarget;
                  const success = await runAction(deleteTarget.role === 'manager' ? 'delete-manager' : 'delete', {
                    account: target.accountRef,
                    confirmation: confirmText,
                  });
                  if (success) {
                    setDeleteTarget(null);
                    setConfirmText('');
                  }
                }}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                永久刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {oneTimeSecret && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-bold">{oneTimeSecret.label}已建立</h2>
            <p className="mt-2 text-sm text-zinc-500">帳號：{oneTimeSecret.key}</p>
            <p className="mt-1 text-xs text-amber-600">關閉後不會再次顯示，請立即安全交付給本人。</p>
            <code className="mt-4 block select-all rounded-xl bg-zinc-100 p-4 text-center text-xl font-bold tracking-wider">
              {oneTimeSecret.value}
            </code>
            <button
              onClick={() => setOneTimeSecret(null)}
              className="mt-4 w-full rounded-xl bg-zinc-900 py-2.5 text-sm font-bold text-white"
            >
              關閉
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
