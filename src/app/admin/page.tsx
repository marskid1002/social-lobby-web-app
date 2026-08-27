'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  getRequestTypeLabel,
  PARTY_FORMAT_LABELS,
  SHOW_REQUEST_CLASSIFICATION,
  VENUE_TYPE_LABELS,
} from '@/lib/utils';

type Account = {
  key: string;
  accountRef: string;
  role: 'user' | 'manager' | 'account_admin' | 'account_viewer' | 'admin';
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
  screenshots?: { id: string }[];
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
  requestTypes: string[];
  venueType: string;
  partyFormat: string;
  peopleCount: number;
  note: string;
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
  escortStatuses: EscortStatus[];
};

type EscortStatus = {
  responseId: string;
  escortId: string;
  escortName: string;
  managerId: string;
  managerAccount: string;
  managerName: string;
  stage: 'waiting' | 'on_stage' | 'active' | 'declined' | 'customer_declined' | 'ended' | 'withdrawn';
  createdAt: string;
  updatedAt: string;
  dispatchOnline?: boolean;
  dispatchPresenceUpdatedAt?: string;
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

type EscortGallery = {
  id: string;
  nickname: string;
  bio: string;
  defaultArea: string;
  createdAt: string;
  managerId: string;
  managerAccount: string;
  managerName: string;
  avatarUrl: string;
  photos: string[];
};

type SystemMessage = {
  id: string;
  recipientId: string;
  recipientAccount: string;
  recipientName: string;
  recipientRole: 'user' | 'manager';
  title: string;
  content: string;
  senderId: string;
  createdAt: string;
  readAt?: string;
  pushSent: number;
  pushTotal: number;
  pushSkipped?: string;
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
  smsRuntime: {
    state: 'no_data' | 'healthy' | 'degraded';
    attempts24h: number;
    failures24h: number;
    lastAttemptAt?: string;
    lastSuccessAt?: string;
    lastFailureAt?: string;
    lastFailureCode?: string;
  };
};

type RequestHistory = {
  id: string;
  creatorId: string;
  creatorName: string;
  area: string;
  requestType: string;
  requestTypes: string[];
  venueType: string;
  partyFormat: string;
  peopleCount: number;
  note: string;
  status: string;
  result: 'completed' | 'confirmed' | 'declined' | 'cancelled' | 'expired';
  createdAt: string;
  expiresAt: string;
  archivedAt: string;
  responseCount: number;
  chatCount: number;
  messageCount: number;
  participants: Array<{
    responseId: string;
    userId: string;
    userName: string;
    dispatcherId?: string;
    dispatcherAccount?: string;
    dispatcherName?: string;
    responseStatus: string;
    invitationStatus?: string;
    managerDecision?: string;
    meetupEndedAt?: string;
  }>;
};

type DashboardData = {
  accounts: Account[];
  reports: Report[];
  dashboard: {
    overview: {
      accounts: number;
      customers: number;
      managers: number;
      escorts: number;
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
  escortGalleries: EscortGallery[];
  systemMessages: SystemMessage[];
  requestHistory: RequestHistory[];
};

type Tab = 'overview' | 'search' | 'flows' | 'history' | 'accounts' | 'galleries' | 'messages' | 'reports' | 'chats' | 'system' | 'danger';

const NAV: Array<{ id: Tab; label: string; short: string }> = [
  { id: 'overview', label: '營運總覽', short: '總覽' },
  { id: 'search', label: '快速查詢', short: '查詢' },
  { id: 'flows', label: '流程診斷', short: '流程' },
  { id: 'history', label: '歷史局', short: '歷史' },
  { id: 'accounts', label: '帳號管理', short: '帳號' },
  { id: 'galleries', label: '小姐相簿總覽', short: '相簿' },
  { id: 'messages', label: '系統訊息', short: '訊息' },
  { id: 'reports', label: '檢舉中心', short: '檢舉' },
  { id: 'chats', label: '聊天室查詢', short: '聊天' },
  { id: 'system', label: '系統狀態', short: '系統' },
  { id: 'danger', label: '危險操作', short: '維護' },
];

const ROLE_LABEL: Record<string, string> = {
  admin: '管理員',
  account_admin: '幹部帳號管理員',
  account_viewer: '幹部稽查員',
  manager: '幹部',
  user: '客戶',
};

const ROSTER_STATUS: Record<RosterMember['status'], { label: string; className: string }> = {
  online: { label: '上班中', className: 'bg-emerald-50 text-emerald-700' },
  offline: { label: '離線', className: 'bg-zinc-100 text-zinc-500' },
  busy: { label: '忙碌中', className: 'bg-pink-50 text-pink-700' },
  removed: { label: '已移除', className: 'bg-red-50 text-red-600' },
};

// 標籤刻意寫成「誰做了什麼」，因為原本 active 叫「約會進行中」會被誤讀成「流程還在跑、幹部尚未回報」，
// 而它其實是「幹部已回報成立」；真正待回報的是 on_stage。
// declined 也原本混了兩種相反的原因：幹部回報未成立 vs 客戶沒選這個人選，
// 導致無法從列表判斷問題出在幹部還是客戶端，故拆成兩個狀態。
const ESCORT_STAGE: Record<EscortStatus['stage'], { label: string; className: string }> = {
  waiting: { label: '等待客戶確認', className: 'bg-amber-100 text-amber-700' },
  on_stage: { label: '客戶已同意・待幹部回報', className: 'bg-sky-100 text-sky-700' },
  active: { label: '幹部已回報成立', className: 'bg-emerald-100 text-emerald-700' },
  declined: { label: '幹部回報未成立', className: 'bg-red-100 text-red-700' },
  customer_declined: { label: '客戶未選擇', className: 'bg-orange-100 text-orange-700' },
  ended: { label: '約會已結束', className: 'bg-zinc-200 text-zinc-700' },
  withdrawn: { label: '人員已撤回', className: 'bg-zinc-100 text-zinc-500' },
};

const REQUEST_STATUS_LABEL: Record<string, string> = {
  open: '進行中',
  closed: '已完成',
  cancelled: '已取消',
  expired: '已過期',
};

const HISTORY_RESULT: Record<RequestHistory['result'], { label: string; className: string }> = {
  completed: { label: '已完成', className: 'bg-sky-100 text-sky-700' },
  confirmed: { label: '約會成立', className: 'bg-emerald-100 text-emerald-700' },
  declined: { label: '未成立', className: 'bg-red-100 text-red-700' },
  cancelled: { label: '已取消', className: 'bg-zinc-100 text-zinc-600' },
  expired: { label: '已過期', className: 'bg-amber-100 text-amber-700' },
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
  'permanently-delete-escort': '永久刪除人員',
  'send-system-message': '發送單人系統訊息',
  'send-system-message-all': '群發系統訊息',
};

const ALL_MESSAGE_RECIPIENTS = '__all_active_recipients__';
const ALL_MESSAGE_CONFIRMATION = 'ALL_ACTIVE_RECIPIENTS';

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

const escortImages = (escort: EscortGallery): string[] =>
  [...new Set([escort.avatarUrl, ...escort.photos].filter(Boolean))];

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />;
}

function MetricCard({
  label,
  value,
  alert = false,
  onClick,
}: {
  label: string;
  value: number | string;
  alert?: boolean;
  onClick?: () => void;
}) {
  const className = `rounded-2xl border p-4 text-left ${alert ? 'border-red-200 bg-red-50' : 'border-zinc-200 bg-white'} ${onClick ? 'cursor-pointer transition hover:border-sky-300 hover:shadow-sm' : ''}`;
  const content = <>
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${alert ? 'text-red-600' : 'text-zinc-900'}`}>{value}</p>
      {onClick && <p className="mt-1 text-[11px] font-semibold text-sky-600">查看詳細內容 →</p>}
    </>;
  return onClick
    ? <button type="button" onClick={onClick} className={className}>{content}</button>
    : <div className={className}>{content}</div>;
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
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, ConversationMessage[]>>({});
  const [chatEscortStatuses, setChatEscortStatuses] = useState<Record<string, EscortStatus[]>>({});
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [oneTimeSecret, setOneTimeSecret] = useState<{ key: string; value: string; label: string } | null>(null);
  const [newManagerName, setNewManagerName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState('');
  const [rosterOpen, setRosterOpen] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState<{ escortId: string; index: number } | null>(null);
  const [messageRecipientId, setMessageRecipientId] = useState('');
  const [messageTitle, setMessageTitle] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [messagePreviewOpen, setMessagePreviewOpen] = useState(false);

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

  const messageRecipients = useMemo(() =>
    (data?.accounts ?? [])
      .filter((account) =>
        (account.role === 'user' || account.role === 'manager')
        && !account.disabled
        && !account.archived)
      .sort((a, b) => a.key.localeCompare(b.key)),
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

  const matchedAccountUserIds = useMemo(() => {
    if (!search.trim()) return new Set<string>();
    return new Set(filteredAccounts.map((account) => account.userId));
  }, [filteredAccounts, search]);

  const filteredFlows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!data) return [];
    if (!query) return data.dashboard.flows;
    return data.dashboard.flows.filter((flow) =>
      matchedAccountUserIds.has(flow.creatorId)
      || flow.escortStatuses.some((escort) =>
        matchedAccountUserIds.has(escort.escortId) || matchedAccountUserIds.has(escort.managerId))
      || [
        flow.requestId,
        flow.creatorName,
        flow.creatorId,
        flow.area,
        flow.issue,
        ...flow.escortStatuses.flatMap((escort) => [
          escort.escortId,
          escort.escortName,
          escort.managerId,
          escort.managerAccount,
          escort.managerName,
        ]),
      ]
        .some((value) => value.toLowerCase().includes(query))
      || data.traceEvents.some((event) =>
        event.requestId === flow.requestId
        && [event.traceId, event.threadId, event.actorUserId, event.entityId, event.code]
          .some((value) => value?.toLowerCase().includes(query))
      )
    );
  }, [data, matchedAccountUserIds, search]);

  const filteredHistory = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!data) return [];
    const records = data.requestHistory ?? [];
    if (!query) return records;
    return records.filter((record) =>
      matchedAccountUserIds.has(record.creatorId)
      || record.participants.some((participant) =>
        matchedAccountUserIds.has(participant.userId)
        || matchedAccountUserIds.has(participant.dispatcherId ?? ''))
      || [
        record.id,
        record.creatorId,
        record.creatorName,
        record.area,
        record.note,
        HISTORY_RESULT[record.result]?.label,
        ...record.participants.flatMap((participant) => [
          participant.userId,
          participant.userName,
          participant.dispatcherId ?? '',
          participant.dispatcherAccount ?? '',
          participant.dispatcherName ?? '',
        ]),
      ].some((value) => value.toLowerCase().includes(query)));
  }, [data, matchedAccountUserIds, search]);

  const filteredEscortGalleries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!data) return [];
    const galleries = data.escortGalleries ?? [];
    if (!query) return galleries;
    return galleries.filter((escort) =>
      matchedAccountUserIds.has(escort.managerId)
      || [
        escort.nickname,
        escort.defaultArea,
        escort.managerAccount,
        escort.managerName,
        escort.managerId,
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [data, matchedAccountUserIds, search]);

  useEffect(() => {
    if (!galleryOpen || !data) return;
    const escort = data.escortGalleries.find((item) => item.id === galleryOpen.escortId);
    const images = escort ? escortImages(escort) : [];
    if (images.length === 0) {
      setGalleryOpen(null);
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGalleryOpen(null);
      if (event.key === 'ArrowLeft') {
        setGalleryOpen((current) => current
          ? { ...current, index: (current.index - 1 + images.length) % images.length }
          : null);
      }
      if (event.key === 'ArrowRight') {
        setGalleryOpen((current) => current
          ? { ...current, index: (current.index + 1) % images.length }
          : null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [galleryOpen, data]);

  const filteredChats = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!data) return [];
    if (!query) return data.dashboard.conversations;
    return data.dashboard.conversations.filter((conversation) =>
      conversation.participants.some((participant) => matchedAccountUserIds.has(participant))
      || [
        conversation.threadId,
        conversation.requestId ?? '',
        conversation.participantNames.join(' '),
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [data, matchedAccountUserIds, search]);

  const filteredIssues = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!data) return [];
    if (!query) return data.issues;
    return data.issues.filter((issue) => {
      const reporterName = data.accounts.find((account) => account.userId === issue.reporterId)?.nickname ?? '';
      return matchedAccountUserIds.has(issue.reporterId) || [
        issue.id,
        issue.reporterId,
        reporterName,
        issue.description,
        issue.page,
        issue.requestId ?? '',
        issue.threadId ?? '',
        issue.traceId ?? '',
        issue.lastErrorCode ?? '',
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [data, matchedAccountUserIds, search]);

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!data) return [];
    if (!query) return data.reports;
    return data.reports.filter((report) => {
      const reporterName = data.accounts.find((account) => account.userId === report.reporterId)?.nickname ?? '';
      const targetName = report.targetName
        || data.accounts.find((account) => account.userId === report.targetId)?.nickname
        || '';
      return matchedAccountUserIds.has(report.reporterId)
        || matchedAccountUserIds.has(report.targetId)
        || [
          report.id,
          report.reporterId,
          reporterName,
          report.targetId,
          targetName,
          report.reason,
        ].some((value) => value.toLowerCase().includes(query));
    });
  }, [data, matchedAccountUserIds, search]);

  const quickQuery = search.trim();
  const quickResultCount = quickQuery
    ? filteredAccounts.length
      + filteredFlows.length
      + filteredHistory.length
      + filteredChats.length
      + filteredEscortGalleries.length
      + filteredIssues.length
      + filteredReports.length
    : 0;

  async function runAction(
    action: string,
    input: {
      account?: string;
      reportId?: string;
      issueId?: string;
      escortId?: string;
      confirmation?: string;
      nickname?: string;
    } = {},
  ) {
    setBusy(`${action}:${input.account ?? input.reportId ?? input.issueId ?? input.escortId ?? ''}`);
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

  async function loadConversation(conversation: Conversation, forceOpen = false) {
    if (!forceOpen && chatOpen === conversation.key) {
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
        escortStatuses?: EscortStatus[];
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
      setChatEscortStatuses((current) => ({
        ...current,
        [conversation.key]: result.escortStatuses ?? [],
      }));
    } catch {
      showToast('對話載入失敗');
    } finally {
      setBusy('');
    }
  }

  async function sendSystemMessage() {
    const sendToAll = messageRecipientId === ALL_MESSAGE_RECIPIENTS;
    const recipient = sendToAll
      ? null
      : messageRecipients.find((account) => account.userId === messageRecipientId);
    if ((!sendToAll && !recipient) || !messageTitle.trim() || !messageContent.trim()) return;
    setBusy('send-system-message');
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-system-message',
          recipientScope: sendToAll ? 'all' : 'single',
          recipientId: recipient?.userId,
          title: messageTitle.trim(),
          content: messageContent.trim(),
          confirmation: sendToAll ? ALL_MESSAGE_CONFIRMATION : recipient?.userId,
        }),
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; count?: number };
      if (!response.ok || !result.ok) {
        showToast(result.error || '訊息發送失敗');
        return;
      }
      setMessagePreviewOpen(false);
      setMessageRecipientId('');
      setMessageTitle('');
      setMessageContent('');
      showToast(sendToAll
        ? `已建立 ${result.count ?? messageRecipients.length} 則官方通知，推播正在分批處理`
        : '官方通知已建立並嘗試推播');
      await load();
    } catch {
      showToast('訊息發送失敗，請稍後再試');
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setSearch(''); setTab('search'); }}
                      className="rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-700"
                    >
                      快速查詢
                    </button>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                      data.system.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {data.system.ready ? '系統正常' : '系統異常'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                  <MetricCard label="全部帳號" value={overview.accounts} />
                  <MetricCard label="客戶／幹部" value={`${overview.customers} / ${overview.managers}`} />
                  <MetricCard label="小姐人數" value={overview.escorts} />
                  <MetricCard
                    label="進行中的局"
                    value={overview.openRequests}
                    onClick={overview.openRequests > 0 ? () => {
                      const active = data.dashboard.flows.find((flow) =>
                        flow.status === 'open' && Date.parse(flow.expiresAt) >= Date.now()
                      );
                      setFlowOpen(active?.requestId ?? null);
                      setSearch('');
                      setTab('flows');
                    } : undefined}
                  />
                  <MetricCard label="有效聊天室" value={overview.activeChats} />
                  <MetricCard label="聊天室訊息" value={overview.messages} />
                  <MetricCard
                    label="歷史局"
                    value={data.requestHistory?.length ?? 0}
                    onClick={(data.requestHistory?.length ?? 0) > 0 ? () => { setSearch(''); setTab('history'); } : undefined}
                  />
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

            {tab === 'search' && (
              <section>
                <h1 className="text-2xl font-bold">快速查詢</h1>
                <p className="mt-1 text-sm text-zinc-500">
                  輸入一次，直接找出相關帳號、局、聊天室、小姐、檢舉與問題回報。
                </p>
                <input
                  autoFocus
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="輸入帳號、姓名、userId、局編號或聊天室編號"
                  className="mt-4 w-full rounded-xl border border-sky-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />

                {!quickQuery ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
                    <p className="font-bold text-zinc-700">輸入任一項資料即可開始</p>
                    <p className="mt-2 text-sm text-zinc-400">例如：A003、王小明、局編號、threadId 或地區</p>
                  </div>
                ) : quickResultCount === 0 ? (
                  <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-8 text-center">
                    <p className="font-bold text-zinc-700">找不到符合「{quickQuery}」的資料</p>
                    <p className="mt-2 text-sm text-zinc-400">請確認編號是否完整，或改用姓名、帳號查詢。</p>
                  </div>
                ) : (
                  <>
                    <p className="mt-4 text-sm font-semibold text-zinc-500">找到 {quickResultCount} 筆相關資料</p>
                    <div className="mt-3 grid gap-4 lg:grid-cols-2">
                      {filteredAccounts.length > 0 && (
                        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                          <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-bold">帳號（{filteredAccounts.length}）</h2>
                          {filteredAccounts.slice(0, 6).map((account) => (
                            <button
                              type="button"
                              key={account.userId}
                              onClick={() => { setSearch(account.userId); setTab('accounts'); }}
                              className="flex w-full items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 text-left last:border-0 hover:bg-sky-50"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold">{account.nickname}</p>
                                <p className="truncate text-xs text-zinc-400">{account.key} · {account.userId}</p>
                              </div>
                              <span className="shrink-0 text-xs font-semibold text-sky-600">
                                {ROLE_LABEL[account.role]} · 查看 →
                              </span>
                            </button>
                          ))}
                          {filteredAccounts.length > 6 && (
                            <button type="button" onClick={() => setTab('accounts')} className="w-full px-4 py-3 text-xs font-bold text-sky-600 hover:bg-sky-50">
                              查看全部 {filteredAccounts.length} 筆帳號 →
                            </button>
                          )}
                        </div>
                      )}

                      {filteredFlows.length > 0 && (
                        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                          <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-bold">目前的局（{filteredFlows.length}）</h2>
                          {filteredFlows.slice(0, 6).map((flow) => (
                            <button
                              type="button"
                              key={flow.requestId}
                              onClick={() => { setSearch(flow.requestId); setFlowOpen(flow.requestId); setTab('flows'); }}
                              className="flex w-full items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 text-left last:border-0 hover:bg-sky-50"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold">{flow.creatorName} · {flow.area || '未填地區'}</p>
                                <p className={`truncate text-xs ${flow.health === 'error' ? 'text-red-600' : 'text-zinc-400'}`}>{flow.issue}</p>
                              </div>
                              <span className="shrink-0 text-xs font-semibold text-sky-600">查看流程 →</span>
                            </button>
                          ))}
                          {filteredFlows.length > 6 && (
                            <button type="button" onClick={() => setTab('flows')} className="w-full px-4 py-3 text-xs font-bold text-sky-600 hover:bg-sky-50">
                              查看全部 {filteredFlows.length} 個流程 →
                            </button>
                          )}
                        </div>
                      )}

                      {filteredHistory.length > 0 && (
                        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                          <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-bold">歷史局（{filteredHistory.length}）</h2>
                          {filteredHistory.slice(0, 6).map((record) => (
                            <button
                              type="button"
                              key={record.id}
                              onClick={() => { setSearch(record.id); setHistoryOpen(record.id); setTab('history'); }}
                              className="flex w-full items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 text-left last:border-0 hover:bg-sky-50"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold">{record.creatorName} · {record.area || '未填地區'}</p>
                                <p className="truncate text-xs text-zinc-400">{HISTORY_RESULT[record.result].label} · {fmtTime(record.createdAt)}</p>
                              </div>
                              <span className="shrink-0 text-xs font-semibold text-sky-600">查看紀錄 →</span>
                            </button>
                          ))}
                          {filteredHistory.length > 6 && (
                            <button type="button" onClick={() => setTab('history')} className="w-full px-4 py-3 text-xs font-bold text-sky-600 hover:bg-sky-50">
                              查看全部 {filteredHistory.length} 筆歷史局 →
                            </button>
                          )}
                        </div>
                      )}

                      {filteredChats.length > 0 && (
                        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                          <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-bold">聊天室（{filteredChats.length}）</h2>
                          {filteredChats.slice(0, 6).map((conversation) => (
                            <button
                              type="button"
                              key={conversation.key}
                              onClick={() => {
                                setSearch(conversation.threadId);
                                setTab('chats');
                                void loadConversation(conversation, true);
                              }}
                              className="flex w-full items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 text-left last:border-0 hover:bg-sky-50"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold">{conversation.participantNames.join(' ↔ ') || '聊天室'}</p>
                                <p className="truncate text-xs text-zinc-400">{conversation.threadId} · {conversation.messageCount} 則</p>
                              </div>
                              <span className="shrink-0 text-xs font-semibold text-sky-600">查看聊天 →</span>
                            </button>
                          ))}
                          {filteredChats.length > 6 && (
                            <button type="button" onClick={() => setTab('chats')} className="w-full px-4 py-3 text-xs font-bold text-sky-600 hover:bg-sky-50">
                              查看全部 {filteredChats.length} 個聊天室 →
                            </button>
                          )}
                        </div>
                      )}

                      {filteredEscortGalleries.length > 0 && (
                        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                          <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-bold">小姐（{filteredEscortGalleries.length}）</h2>
                          {filteredEscortGalleries.slice(0, 6).map((escort) => (
                            <button
                              type="button"
                              key={escort.id}
                              onClick={() => { setSearch(escort.nickname); setTab('galleries'); }}
                              className="flex w-full items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 text-left last:border-0 hover:bg-sky-50"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold">{escort.nickname} · {escort.defaultArea || '未填地區'}</p>
                                <p className="truncate text-xs text-zinc-400">所屬：{escort.managerName}（{escort.managerAccount}）</p>
                              </div>
                              <span className="shrink-0 text-xs font-semibold text-sky-600">查看相簿 →</span>
                            </button>
                          ))}
                          {filteredEscortGalleries.length > 6 && (
                            <button type="button" onClick={() => setTab('galleries')} className="w-full px-4 py-3 text-xs font-bold text-sky-600 hover:bg-sky-50">
                              查看全部 {filteredEscortGalleries.length} 位小姐 →
                            </button>
                          )}
                        </div>
                      )}

                      {(filteredIssues.length > 0 || filteredReports.length > 0) && (
                        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                          <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-bold">
                            檢舉與問題回報（{filteredIssues.length + filteredReports.length}）
                          </h2>
                          {filteredIssues.slice(0, 3).map((issue) => (
                            <button
                              type="button"
                              key={issue.id}
                              onClick={() => { setSearch(issue.id); setTab('reports'); }}
                              className="flex w-full items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 text-left hover:bg-sky-50"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold">問題回報 · {accountName(issue.reporterId)}</p>
                                <p className="truncate text-xs text-zinc-400">{issue.description}</p>
                              </div>
                              <span className="shrink-0 text-xs font-semibold text-sky-600">{issue.resolved ? '已處理' : '待處理'} →</span>
                            </button>
                          ))}
                          {filteredReports.slice(0, 3).map((report) => (
                            <button
                              type="button"
                              key={report.id}
                              onClick={() => { setSearch(report.id); setTab('reports'); }}
                              className="flex w-full items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 text-left last:border-0 hover:bg-sky-50"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold">使用者檢舉 · {report.targetName || accountName(report.targetId)}</p>
                                <p className="truncate text-xs text-zinc-400">{report.reason || '未填原因'}</p>
                              </div>
                              <span className="shrink-0 text-xs font-semibold text-sky-600">{report.resolved ? '已處理' : '待處理'} →</span>
                            </button>
                          ))}
                          {(filteredIssues.length > 3 || filteredReports.length > 3) && (
                            <button type="button" onClick={() => setTab('reports')} className="w-full px-4 py-3 text-xs font-bold text-sky-600 hover:bg-sky-50">
                              查看全部 {filteredIssues.length + filteredReports.length} 筆回報 →
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
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
                              {flow.creatorName}{SHOW_REQUEST_CLASSIFICATION ? ` · ${getRequestTypeLabel(flow)}` : ''}
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
                            <div className="rounded-2xl border border-[#3b4052] bg-[#10131f] p-5 text-[#f7f7fa] shadow-lg">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-lg font-black text-white">局的完整內容</p>
                                  <p className="mt-1 text-xs text-[#aeb3c2]">{flow.creatorName} 發布的邀約</p>
                                </div>
                                <span className={`rounded-full px-3 py-1.5 text-xs font-black ${
                                  flow.status === 'open' && Date.parse(flow.expiresAt) >= Date.now()
                                    ? 'bg-[#123d32] text-[#57e2ae]'
                                    : 'bg-[#303442] text-[#d5d8e2]'
                                }`}>
                                  {flow.status === 'open' && Date.parse(flow.expiresAt) >= Date.now()
                                    ? '進行中'
                                    : REQUEST_STATUS_LABEL[flow.status] ?? flow.status}
                                </span>
                              </div>
                              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                {[
                                  ['地區', flow.area || '未填寫'],
                                  ['地點', (VENUE_TYPE_LABELS[flow.venueType] ?? flow.venueType) || '未填寫'],
                                  ['邀約類型', getRequestTypeLabel(flow) || '未填寫'],
                                  ['局型', (PARTY_FORMAT_LABELS[flow.partyFormat] ?? flow.partyFormat) || '未填寫'],
                                  ['需求人數', flow.peopleCount > 0 ? `${flow.peopleCount} 人` : '未填寫'],
                                  ['發布時間', fmtTime(flow.createdAt)],
                                  ['有效期限', fmtTime(flow.expiresAt)],
                                ].map(([label, value]) => (
                                  <div key={label} className="rounded-xl border border-[#303647] bg-[#1a1e2c] px-3.5 py-3">
                                    <p className="text-[11px] font-bold text-[#999fb0]">{label}</p>
                                    <p className="mt-1 break-words text-sm font-black text-white">{value}</p>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-4 rounded-xl border border-[#584939] bg-[#211c19] p-4">
                                <p className="text-[11px] font-bold text-[#d4aa72]">客戶備註</p>
                                <p className="mt-1 whitespace-pre-wrap break-words text-base font-bold leading-relaxed text-white">{flow.note || '沒有填寫備註'}</p>
                              </div>
                              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {[
                                  ['收到回應', flow.responseCount],
                                  ['已接受安排', flow.joiningCount],
                                  ['相關聊天室', flow.chatCount],
                                  ['聊天室訊息', flow.messageCount],
                                ].map(([label, value]) => (
                                  <div key={label} className="rounded-xl bg-[#252a3a] p-3 text-center">
                                    <p className="text-xl font-black text-white">{value}</p>
                                    <p className="mt-1 text-[11px] font-bold text-[#aeb3c2]">{label}</p>
                                  </div>
                                ))}
                              </div>
                              {flow.escortStatuses.length > 0 && (
                                <div className="mt-4 rounded-xl border border-[#303647] bg-[#171b28] p-4">
                                  <p className="text-xs font-black text-white">小姐上台狀況</p>
                                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    {flow.escortStatuses.map((escort) => {
                                      const status = ESCORT_STAGE[escort.stage];
                                      return (
                                        <div key={escort.responseId} className="flex items-center justify-between gap-3 rounded-xl bg-[#252a3a] p-3">
                                          <div className="min-w-0">
                                            <p className="truncate text-sm font-black text-white">{escort.escortName}</p>
                                            <p className="mt-1 truncate text-[11px] text-[#aeb3c2]">
                                              所屬幹部：{escort.managerAccount ? `${escort.managerAccount}・` : ''}{escort.managerName}
                                            </p>
                                            {escort.dispatchOnline !== undefined && (
                                              <p className="mt-1 text-[10px] text-[#aeb3c2]">
                                                派工當下：{escort.dispatchOnline ? '在線' : '離線'}
                                                {escort.dispatchPresenceUpdatedAt ? ` · 狀態更新 ${fmtTime(escort.dispatchPresenceUpdatedAt)}` : ''}
                                              </p>
                                            )}
                                          </div>
                                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${status.className}`}>
                                            {status.label}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>

                            <details className="mt-3 rounded-xl border border-zinc-200 bg-white p-4">
                              <summary className="cursor-pointer text-sm font-bold text-zinc-700">系統診斷資訊（排查問題時再看）</summary>
                              <div className="mt-4 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2 lg:grid-cols-3">
                                <p>局編號：<span className="break-all font-mono text-zinc-800">{flow.requestId}</span></p>
                                <p>追蹤碼：<span className="break-all font-mono text-zinc-800">{traceId ?? '尚無紀錄'}</span></p>
                                <p>系統狀態：<span className="text-zinc-800">{flow.status}</span></p>
                              </div>
                              <div className="mt-4 grid gap-2 sm:grid-cols-5">
                                {flow.steps.map((step, index) => (
                                  <div key={step.key} className="relative rounded-xl border border-zinc-200 bg-zinc-50 p-3">
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
                              <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
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
                            </details>
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

            {tab === 'history' && (
              <section>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-bold">歷史局</h1>
                    <p className="mt-1 text-sm text-zinc-500">僅 A000 可查看；原始局清理前會保留營運快照，但不保存聊天內容。</p>
                  </div>
                  <span className="w-fit rounded-full bg-zinc-900 px-3 py-1 text-xs font-bold text-white">
                    共 {data.requestHistory?.length ?? 0} 局
                  </span>
                </div>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜尋局編號、客戶、小姐、幹部、地區或備註"
                  className="mt-4 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-400"
                />
                <div className="mt-4 space-y-3">
                  {filteredHistory.map((record) => {
                    const isOpen = historyOpen === record.id;
                    const result = HISTORY_RESULT[record.result];
                    return (
                      <article key={record.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                        <button
                          type="button"
                          onClick={() => setHistoryOpen(isOpen ? null : record.id)}
                          className="flex w-full items-center gap-3 p-4 text-left hover:bg-zinc-50"
                        >
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${result.className}`}>
                            {result.label}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold">{record.creatorName} · {record.area || '未填地區'}</p>
                            <p className="mt-0.5 truncate text-xs text-zinc-500">
                              {record.participants.length > 0
                                ? `參與：${record.participants.map((participant) => participant.userName).join('、')}`
                                : '沒有參與人員'}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs font-semibold text-zinc-600">{record.responseCount} 回應 · {record.chatCount} 聊天</p>
                            <p className="mt-0.5 text-[10px] text-zinc-400">{fmtTime(record.createdAt)}</p>
                          </div>
                        </button>
                        {isOpen && (
                          <div className="border-t border-zinc-100 bg-zinc-50 p-4">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                              {[
                                ['局編號', record.id],
                                ['發局客戶', `${record.creatorName} · ${record.creatorId}`],
                                ['地區', record.area || '未填寫'],
                                ['需求人數', `${record.peopleCount || 0} 人`],
                                ['發布時間', fmtTime(record.createdAt)],
                                ['原定期限', fmtTime(record.expiresAt)],
                                ['封存時間', fmtTime(record.archivedAt)],
                                ['訊息數量', `${record.messageCount} 則（不保存內容）`],
                              ].map(([label, value]) => (
                                <div key={label} className="rounded-xl border border-zinc-200 bg-white p-3">
                                  <p className="text-[10px] font-bold text-zinc-400">{label}</p>
                                  <p className="mt-1 break-all text-xs font-bold text-zinc-800">{value}</p>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4">
                              <p className="text-xs font-bold text-zinc-500">客戶備註</p>
                              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-800">{record.note || '沒有填寫備註'}</p>
                            </div>
                            <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4">
                              <p className="text-xs font-bold text-zinc-700">參與與派工結果</p>
                              {record.participants.length === 0 ? (
                                <p className="mt-2 text-xs text-zinc-400">這個局沒有收到加入或派工回應。</p>
                              ) : (
                                <div className="mt-3 grid gap-2 md:grid-cols-2">
                                  {record.participants.map((participant) => (
                                    <div key={participant.responseId} className="rounded-xl bg-zinc-50 p-3 text-xs">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="font-bold text-zinc-900">{participant.userName}</p>
                                        <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-zinc-600">
                                          {participant.managerDecision === 'confirmed'
                                            ? '確認成立'
                                            : participant.managerDecision === 'declined'
                                              ? '未成立'
                                              : participant.responseStatus}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-zinc-500">
                                        {participant.dispatcherName
                                          ? `派工幹部：${participant.dispatcherAccount ? `${participant.dispatcherAccount}・` : ''}${participant.dispatcherName}`
                                          : '自行加入'}
                                      </p>
                                      <p className="mt-1 break-all font-mono text-[10px] text-zinc-400">{participant.userId}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {filteredHistory.length === 0 && (
                    <p className="rounded-2xl bg-white p-8 text-center text-sm text-zinc-400">
                      尚無歷史局；局結束、過期或進入資料清理時會自動封存。
                    </p>
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
                            {account.role === 'account_viewer'
                              ? account.hasPassword ? '清除密碼讓本人重設' : '等待本人設定密碼'
                              : account.role === 'manager' || account.role === 'account_admin'
                                ? account.hasPassword
                                ? '重設並產生新啟用碼'
                                : account.hasActivationCode
                                  ? '重發啟用碼'
                                  : '產生啟用碼'
                              : '重設密碼'}
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
                                    <button
                                      type="button"
                                      disabled={Boolean(busy) || member.status === 'busy'}
                                      onClick={() => {
                                        const confirmation = window.prompt(
                                          `將永久刪除 ${member.nickname}，包含人員資料與照片。歷史局與聊天室紀錄會保留。\n\n請輸入人員編號確認：\n${member.id}`,
                                        );
                                        if (confirmation === null) return;
                                        if (confirmation.trim() !== member.id) {
                                          showToast('人員編號不一致，已取消刪除');
                                          return;
                                        }
                                        runAction('permanently-delete-escort', {
                                          escortId: member.id,
                                          confirmation: confirmation.trim(),
                                        });
                                      }}
                                      className="rounded-lg border border-red-200 px-2 py-1 text-[10px] font-bold text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      {member.status === 'busy' ? '約會中不可刪除' : '永久刪除'}
                                    </button>
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

            {tab === 'galleries' && (
              <section>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-bold">小姐相簿總覽</h1>
                    <p className="mt-1 text-sm text-zinc-500">
                      僅 A000 可查看所有小姐的大頭照、相簿與所屬帳號。
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-pink-100 px-3 py-1 text-xs font-bold text-pink-700">
                    共 {data.escortGalleries?.length ?? 0} 位
                  </span>
                </div>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜尋小姐、地區或所屬帳號"
                  className="mt-4 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-pink-400"
                />

                {filteredEscortGalleries.length > 0 ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredEscortGalleries.map((escort) => {
                      const images = escortImages(escort);
                      const coverImage = images[0];
                      return (
                        <article key={escort.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                          <div className="flex items-center gap-3 border-b border-zinc-100 p-4">
                            {coverImage ? (
                              <button
                                type="button"
                                onClick={() => setGalleryOpen({ escortId: escort.id, index: 0 })}
                                className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-zinc-100"
                              >
                                <img src={coverImage} alt={`${escort.nickname} 大頭照`} className="h-full w-full object-cover" />
                              </button>
                            ) : (
                              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-zinc-100 text-xs text-zinc-400">
                                無照片
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-bold text-zinc-900">{escort.nickname}</p>
                              <p className="mt-1 truncate text-xs text-zinc-500">
                                {escort.managerAccount} · {escort.managerName}
                              </p>
                              <p className="mt-1 text-xs text-zinc-400">
                                {escort.defaultArea || '未填地區'} · {images.length} 張照片
                              </p>
                            </div>
                          </div>

                          <div className="p-4">
                            {escort.bio && (
                              <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-zinc-500">{escort.bio}</p>
                            )}
                            {images.length > 0 ? (
                              <div className="grid grid-cols-4 gap-2">
                                {images.map((url, index) => (
                                  <button
                                    key={`${url}-${index}`}
                                    type="button"
                                    onClick={() => setGalleryOpen({ escortId: escort.id, index })}
                                    className="aspect-square overflow-hidden rounded-xl bg-zinc-100 transition hover:opacity-80"
                                  >
                                    <img
                                      src={url}
                                      alt={`${escort.nickname} 照片 ${index + 1}`}
                                      loading="lazy"
                                      className="h-full w-full object-cover"
                                    />
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="rounded-xl bg-zinc-50 py-6 text-center text-xs text-zinc-400">尚未上傳照片</p>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-4 rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">
                    找不到符合條件的小姐
                  </p>
                )}
              </section>
            )}

            {tab === 'messages' && (
              <section>
                <h1 className="text-2xl font-bold">系統訊息</h1>
                <p className="mt-1 text-sm text-zinc-500">以 JUGA 官方通知傳送給單一帳號，或一次發送給所有啟用中的客戶與幹部。</p>

                <div className="mt-4 rounded-2xl border border-sky-200 bg-white p-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <label className="text-xs font-bold text-zinc-600" htmlFor="system-message-recipient">收件人</label>
                      <select
                        id="system-message-recipient"
                        value={messageRecipientId}
                        onChange={(event) => setMessageRecipientId(event.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm outline-none focus:border-sky-400"
                      >
                        <option value="">請選擇收件人</option>
                        <option value={ALL_MESSAGE_RECIPIENTS}>所有人（{messageRecipients.length} 位啟用中客戶與幹部）</option>
                        {messageRecipients.map((account) => (
                            <option key={account.userId} value={account.userId}>
                              {account.key} · {account.nickname} · {ROLE_LABEL[account.role]}
                            </option>
                          ))}
                      </select>
                      {messageRecipientId === ALL_MESSAGE_RECIPIENTS && (
                        <p className="mt-1.5 text-xs font-semibold text-amber-600">
                          群發會同時建立 {messageRecipients.length} 則站內訊息，發送後無法收回。
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-bold text-zinc-600" htmlFor="system-message-title">標題</label>
                      <input
                        id="system-message-title"
                        value={messageTitle}
                        onChange={(event) => setMessageTitle(event.target.value.slice(0, 60))}
                        placeholder="例如：帳號資料提醒"
                        className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-3 text-sm outline-none focus:border-sky-400"
                      />
                      <p className="mt-1 text-right text-[11px] text-zinc-400">{messageTitle.length}/60</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="text-xs font-bold text-zinc-600" htmlFor="system-message-content">訊息內容</label>
                    <textarea
                      id="system-message-content"
                      value={messageContent}
                      onChange={(event) => setMessageContent(event.target.value.slice(0, 1000))}
                      rows={6}
                      placeholder="請勿傳送密碼、啟用碼或不必要的個人資料。"
                      className="mt-1.5 w-full resize-y rounded-xl border border-zinc-200 px-3 py-3 text-sm leading-relaxed outline-none focus:border-sky-400"
                    />
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="text-amber-600">發送後不可修改，並會保留操作紀錄。</span>
                      <span className="text-zinc-400">{messageContent.length}/1000</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={
                      !messageRecipientId
                      || (messageRecipientId === ALL_MESSAGE_RECIPIENTS && messageRecipients.length === 0)
                      || !messageTitle.trim()
                      || !messageContent.trim()
                      || Boolean(busy)
                    }
                    onClick={() => setMessagePreviewOpen(true)}
                    className="mt-4 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                  >
                    預覽並確認
                  </button>
                </div>

                <h2 className="mt-6 text-sm font-bold text-zinc-800">最近發送紀錄</h2>
                <div className="mt-3 space-y-3">
                  {(data.systemMessages ?? []).map((message) => (
                    <article key={message.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-bold text-zinc-900">{message.title}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {message.recipientAccount} · {message.recipientName} · {ROLE_LABEL[message.recipientRole]}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2 text-[10px] font-bold">
                          <span className={`rounded-full px-2 py-1 ${message.readAt ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {message.readAt ? `已讀 ${fmtTime(message.readAt)}` : '未讀'}
                          </span>
                          <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-600">
                            推播 {message.pushSent}/{message.pushTotal}
                          </span>
                        </div>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-sm leading-relaxed text-zinc-700">{message.content}</p>
                      <p className="mt-2 text-xs text-zinc-400">{fmtTime(message.createdAt)} · {message.id}</p>
                    </article>
                  ))}
                  {(data.systemMessages ?? []).length === 0 && (
                    <p className="rounded-2xl bg-white p-6 text-center text-sm text-zinc-400">尚未發送任何系統訊息</p>
                  )}
                </div>
              </section>
            )}

            {tab === 'reports' && (
              <section>
                <h1 className="text-2xl font-bold">回報與檢舉中心</h1>
                <p className="mt-1 text-sm text-zinc-500">流程問題會附上 traceId、頁面與裝置；使用者檢舉可直接處理帳號。</p>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜尋姓名、帳號、回報內容、局或聊天室編號"
                  className="mt-4 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-400"
                />
                <h2 className="mt-5 text-sm font-bold text-zinc-800">流程問題回報</h2>
                <div className="mt-3 space-y-3">
                  {[...filteredIssues]
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
                        {issue.screenshots && issue.screenshots.length > 0 && (
                          <div className="mt-3">
                            <p className="mb-2 text-xs font-bold text-zinc-600">使用者截圖（{issue.screenshots.length} 張）</p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {issue.screenshots.map((screenshot, index) => {
                                const src = `/api/admin/issue-image?issueId=${encodeURIComponent(issue.id)}&screenshotId=${encodeURIComponent(screenshot.id)}`;
                                return (
                                  <a
                                    key={screenshot.id}
                                    href={src}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="group relative aspect-video overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100"
                                    title="點擊放大截圖"
                                  >
                                    <img src={src} alt={`問題截圖 ${index + 1}`} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
                                    <span className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-center text-[10px] font-semibold text-white">點擊放大</span>
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}
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
                  {filteredIssues.length === 0 && (
                    <p className="rounded-2xl bg-white p-5 text-center text-sm text-zinc-400">
                      {search.trim() ? '找不到符合條件的問題回報。' : '目前沒有流程問題回報。'}
                    </p>
                  )}
                </div>
                <h2 className="mt-6 text-sm font-bold text-zinc-800">使用者檢舉</h2>
                <div className="mt-4 space-y-3">
                  {[...filteredReports]
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
                  {filteredReports.length === 0 && (
                    <p className="rounded-2xl bg-white p-6 text-center text-sm text-zinc-400">
                      {search.trim() ? '找不到符合條件的檢舉。' : '目前沒有檢舉。'}
                    </p>
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
                    const escortStatuses = chatEscortStatuses[conversation.key] ?? [];
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
                            {escortStatuses.length > 0 && (
                              <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3">
                                <p className="text-xs font-bold text-sky-900">小姐上台狀況</p>
                                <div className="mt-2 space-y-2">
                                  {escortStatuses.map((escort) => {
                                    const status = ESCORT_STAGE[escort.stage];
                                    return (
                                      <div key={escort.responseId} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                                        <div className="min-w-0">
                                          <p className="truncate text-xs font-bold text-zinc-900">{escort.escortName}</p>
                                          <p className="truncate text-[10px] text-zinc-500">
                                            所屬幹部：{escort.managerAccount ? `${escort.managerAccount}・` : ''}{escort.managerName} · 更新 {fmtTime(escort.updatedAt)}
                                          </p>
                                          {escort.dispatchOnline !== undefined && (
                                            <p className="text-[10px] text-zinc-500">
                                              派工當下：{escort.dispatchOnline ? '在線' : '離線'}
                                              {escort.dispatchPresenceUpdatedAt ? ` · 狀態更新 ${fmtTime(escort.dispatchPresenceUpdatedAt)}` : ''}
                                            </p>
                                          )}
                                        </div>
                                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${status.className}`}>
                                          {status.label}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
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
                            {messages && messages.length === 0 && busy !== `chat:${conversation.key}` && (
                              <p className="py-3 text-center text-xs text-zinc-400">這個聊天室尚無一般訊息。</p>
                            )}
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
                <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm">
                  <div className="flex items-center gap-2">
                    <StatusDot ok={data.system.smsConfigured && data.system.smsRuntime.state !== 'degraded'} />
                    <h2 className="font-bold">SMS 實際發送狀況</h2>
                  </div>
                  {data.system.smsRuntime.state === 'no_data' ? (
                    <p className="mt-3 text-zinc-500">目前尚無簡訊發送紀錄；上方只代表設定完整。</p>
                  ) : (
                    <div className="mt-3 space-y-1 text-zinc-600">
                      <p>最近一次：{data.system.smsRuntime.state === 'healthy' ? '成功' : '失敗'} · {fmtTime(data.system.smsRuntime.lastAttemptAt)}</p>
                      <p>近 24 小時：發送 {data.system.smsRuntime.attempts24h} 次，失敗 {data.system.smsRuntime.failures24h} 次</p>
                      {data.system.smsRuntime.lastFailureAt && (
                        <p className="text-red-600">最近失敗：{fmtTime(data.system.smsRuntime.lastFailureAt)}{data.system.smsRuntime.lastFailureCode ? ` · ${data.system.smsRuntime.lastFailureCode}` : ''}</p>
                      )}
                    </div>
                  )}
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

      {messagePreviewOpen && (() => {
        const sendToAll = messageRecipientId === ALL_MESSAGE_RECIPIENTS;
        const recipient = sendToAll
          ? null
          : messageRecipients.find((account) => account.userId === messageRecipientId);
        if (!sendToAll && !recipient) return null;
        const customerCount = messageRecipients.filter((account) => account.role === 'user').length;
        const managerCount = messageRecipients.filter((account) => account.role === 'manager').length;
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-4" onClick={() => setMessagePreviewOpen(false)}>
            <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <h2 className="text-lg font-bold">確認發送官方通知</h2>
              <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
                {sendToAll ? (
                  <>
                    <p><span className="text-zinc-500">收件人：</span><b>所有啟用中的客戶與幹部</b></p>
                    <p className="mt-1"><span className="text-zinc-500">合計：</span>{messageRecipients.length} 人（客戶 {customerCount} 人、幹部 {managerCount} 人）</p>
                  </>
                ) : (
                  <>
                    <p><span className="text-zinc-500">收件人：</span><b>{recipient!.key} · {recipient!.nickname}</b></p>
                    <p className="mt-1"><span className="text-zinc-500">身分：</span>{ROLE_LABEL[recipient!.role]}</p>
                  </>
                )}
              </div>
              <div className="mt-4 rounded-xl bg-zinc-50 p-4">
                <p className="text-xs font-bold text-sky-700">JUGA 官方通知</p>
                <p className="mt-2 font-bold text-zinc-900">{messageTitle.trim()}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{messageContent.trim()}</p>
              </div>
              <p className="mt-3 text-xs text-amber-600">
                {sendToAll
                  ? `即將發送給 ${messageRecipients.length} 人。發送後不能修改或收回。`
                  : '請確認帳號與內容。發送後不能修改或收回。'}
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setMessagePreviewOpen(false)}
                  className="flex-1 rounded-xl bg-zinc-100 py-3 text-sm font-semibold"
                >
                  返回修改
                </button>
                <button
                  type="button"
                  disabled={busy === 'send-system-message'}
                  onClick={sendSystemMessage}
                  className={`flex-1 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50 ${sendToAll ? 'bg-amber-600' : 'bg-sky-600'}`}
                >
                  {busy === 'send-system-message'
                    ? '發送中…'
                    : sendToAll ? `確認發送給 ${messageRecipients.length} 人` : '確認發送'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {galleryOpen && (() => {
        const escort = data.escortGalleries.find((item) => item.id === galleryOpen.escortId);
        if (!escort) return null;
        const images = escortImages(escort);
        if (images.length === 0) return null;
        const index = Math.min(galleryOpen.index, images.length - 1);
        return (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`${escort.nickname} 相簿`}
            onClick={() => setGalleryOpen(null)}
          >
            <div className="relative flex h-full w-full max-w-6xl flex-col" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between pb-3 text-white">
                <div>
                  <p className="font-bold">{escort.nickname}</p>
                  <p className="text-xs text-white/60">{index + 1} / {images.length}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setGalleryOpen(null)}
                  className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-2xl leading-none hover:bg-white/20"
                  aria-label="關閉相簿"
                >
                  ×
                </button>
              </div>
              <div className="relative min-h-0 flex-1">
                <img
                  src={images[index]}
                  alt={`${escort.nickname} 照片 ${index + 1}`}
                  className="h-full w-full object-contain"
                />
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setGalleryOpen({
                        escortId: escort.id,
                        index: (index - 1 + images.length) % images.length,
                      })}
                      className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                      aria-label="上一張"
                    >
                      <ChevronLeft className="h-6 w-6" strokeWidth={2.25} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setGalleryOpen({
                        escortId: escort.id,
                        index: (index + 1) % images.length,
                      })}
                      className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                      aria-label="下一張"
                    >
                      <ChevronRight className="h-6 w-6" strokeWidth={2.25} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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
