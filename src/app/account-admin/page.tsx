'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Manager = {
  key: string;
  nickname: string;
  privateName?: string;
  hasPassword: boolean;
  disabled: boolean;
  archived: boolean;
  mustChangeNickname: boolean;
};

type RosterStatus = 'online' | 'offline' | 'busy' | 'removed';

type ManagerRoster = {
  managerKey: string;
  activeCount: number;
  removedCount: number;
  totalCreated: number;
  members: Array<{ nickname: string; status: RosterStatus }>;
};

type EscortDirectoryStatus = 'online' | 'busy' | 'offline' | 'unset';
type EscortDirectoryItem = {
  id: string;
  nickname: string;
  status: EscortDirectoryStatus;
  statusUpdatedAt?: string;
  managerId: string;
  managerAccount: string;
  managerName: string;
  managerPrivateName?: string;
};
type EscortDirectoryResponse = {
  items: EscortDirectoryItem[];
  counts: Record<'all' | EscortDirectoryStatus, number>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

const ROSTER_STATUS: Record<RosterStatus, { label: string; className: string }> = {
  online: { label: '上線', className: 'bg-emerald-400/15 text-emerald-300' },
  offline: { label: '離線', className: 'bg-zinc-500/15 text-zinc-400' },
  busy: { label: '忙碌', className: 'bg-amber-400/15 text-amber-300' },
  removed: { label: '已移除', className: 'bg-red-400/15 text-red-300' },
};

const DIRECTORY_STATUS: Record<EscortDirectoryStatus, { label: string; className: string }> = {
  online: { label: '上班中', className: 'bg-emerald-400/15 text-emerald-300' },
  busy: { label: '忙碌中', className: 'bg-pink-400/15 text-pink-300' },
  offline: { label: '離線', className: 'bg-zinc-500/15 text-zinc-400' },
  unset: { label: '尚未設定', className: 'bg-amber-400/15 text-amber-300' },
};

const fmtTime = (iso?: string) => {
  if (!iso) return '從未設定';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '時間不明' : date.toLocaleString('zh-TW');
};

export default function AccountAdminPage() {
  const router = useRouter();
  const [managers, setManagers] = useState<Manager[]>([]);
  const [rosters, setRosters] = useState<ManagerRoster[]>([]);
  const [expandedManager, setExpandedManager] = useState<string | null>(null);
  const [editingPrivateName, setEditingPrivateName] = useState<string | null>(null);
  const [privateNameDraft, setPrivateNameDraft] = useState('');
  const [nickname, setNickname] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [account, setAccount] = useState('A888');
  const [managerSearch, setManagerSearch] = useState('');
  const [escortQuery, setEscortQuery] = useState('');
  const [escortStatus, setEscortStatus] = useState<'all' | EscortDirectoryStatus>('all');
  const [escortSort, setEscortSort] = useState<'status' | 'updated' | 'name' | 'manager'>('status');
  const [escortPage, setEscortPage] = useState(1);
  const [escortDirectory, setEscortDirectory] = useState<EscortDirectoryResponse | null>(null);
  const [escortDirectoryLoading, setEscortDirectoryLoading] = useState(false);
  const [escortDirectoryError, setEscortDirectoryError] = useState('');
  const [directoryRefreshKey, setDirectoryRefreshKey] = useState(0);

  const load = useCallback(async () => {
    const response = await fetch('/api/account-admin', { cache: 'no-store' });
    if (response.status === 401 || response.status === 403) return router.replace('/login');
    const data = await response.json();
    setManagers(data.managers ?? []);
    setRosters(data.rosters ?? []);
    setReadOnly(data.readOnly === true);
    setAccount(typeof data.account === 'string' ? data.account : 'A888');
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!readOnly) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setEscortDirectoryLoading(true);
      setEscortDirectoryError('');
      try {
        const query = new URLSearchParams({
          q: escortQuery.trim(),
          status: escortStatus,
          sort: escortSort,
          page: String(escortPage),
          pageSize: '50',
        });
        const response = await fetch(`/api/account-admin/escorts?${query}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({})) as EscortDirectoryResponse & { error?: string };
        if (!response.ok) throw new Error(result.error || '小姐狀態載入失敗');
        setEscortDirectory(result);
        if (result.pagination.page !== escortPage) setEscortPage(result.pagination.page);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setEscortDirectoryError(loadError instanceof Error ? loadError.message : '小姐狀態載入失敗');
        }
      } finally {
        if (!controller.signal.aborted) setEscortDirectoryLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [readOnly, escortQuery, escortStatus, escortSort, escortPage, directoryRefreshKey]);

  async function act(action: string, account?: string, extra?: Record<string, unknown>) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/account-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, account, ...extra }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) return setMessage(data.error ?? '操作失敗');
      if (data.activationCode) {
        setMessage(`${data.account} 一次性啟用碼：${data.activationCode}（使用或重發後失效，只顯示這一次）`);
      } else {
        setMessage('操作完成');
      }
      setNickname('');
      await load();
    } catch {
      setMessage('連線失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function savePrivateName(managerKey: string) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/account-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-private-name',
          account: managerKey,
          privateName: privateNameDraft,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) return setMessage(data.error ?? '儲存失敗');
      setEditingPrivateName(null);
      setPrivateNameDraft('');
      setMessage(privateNameDraft.trim() ? '私人名稱已儲存，只有你看得到。' : '私人名稱已清除。');
      await load();
      setDirectoryRefreshKey((current) => current + 1);
    } catch {
      setMessage('連線失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
    router.replace('/login');
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-pink-300">{account}</p>
            <h1 className="text-2xl font-semibold">{readOnly ? '幹部稽查員' : '幹部帳號管理'}</h1>
          </div>
          <button onClick={logout} className="rounded-lg border border-white/15 px-4 py-2 text-sm">登出</button>
        </header>

        {readOnly && message && (
          <p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/10 px-4 py-3 text-sm text-amber-200">
            {message}
          </p>
        )}

        {readOnly && (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold">小姐狀態查詢</h2>
                <p className="mt-1 text-xs text-zinc-500">跨幹部唯讀查詢；可用小姐、幹部帳號或你的私人名稱搜尋。</p>
              </div>
              <select
                value={escortSort}
                onChange={(event) => { setEscortSort(event.target.value as typeof escortSort); setEscortPage(1); }}
                className="rounded-xl border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-white"
                aria-label="小姐排序方式"
              >
                <option value="status">狀態優先</option>
                <option value="updated">最近更新</option>
                <option value="name">小姐名稱</option>
                <option value="manager">幹部帳號</option>
              </select>
            </div>
            <input
              value={escortQuery}
              onChange={(event) => { setEscortQuery(event.target.value); setEscortPage(1); }}
              placeholder="搜尋小姐暱稱、小姐 ID、幹部帳號、正式名稱或私人名稱"
              className="mt-4 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-600"
            />
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {(['all', 'online', 'busy', 'offline', 'unset'] as const).map((statusKey) => (
                <button
                  key={statusKey}
                  type="button"
                  onClick={() => { setEscortStatus(statusKey); setEscortPage(1); }}
                  className={`shrink-0 rounded-full px-3 py-2 text-xs font-medium ${
                    escortStatus === statusKey ? 'bg-pink-500 text-white' : 'border border-white/10 bg-black/20 text-zinc-400'
                  }`}
                >
                  {statusKey === 'all' ? '全部' : DIRECTORY_STATUS[statusKey].label} {escortDirectory?.counts[statusKey] ?? 0}
                </button>
              ))}
            </div>
            {escortDirectoryError && (
              <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">{escortDirectoryError}</p>
            )}
            <div className={`mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 ${escortDirectoryLoading ? 'opacity-60' : ''}`}>
              {escortDirectory?.items.map((escort) => {
                const status = DIRECTORY_STATUS[escort.status];
                return (
                  <article key={escort.id} className="rounded-xl border border-white/10 bg-black/25 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-white">{escort.nickname}</h3>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${status.className}`}>{status.label}</span>
                    </div>
                    <p className="mt-1 break-all font-mono text-[11px] text-zinc-600">{escort.id}</p>
                    <div className="mt-3 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-zinc-400">
                      <p>
                        隸屬：{escort.managerAccount}・
                        <span className="text-zinc-200">{escort.managerPrivateName || escort.managerName}</span>
                      </p>
                      {escort.managerPrivateName && <p className="mt-1 text-[11px] text-zinc-600">系統名稱：{escort.managerName}</p>}
                    </div>
                    <p className="mt-3 text-xs text-zinc-500">狀態更新：{fmtTime(escort.statusUpdatedAt)}</p>
                  </article>
                );
              })}
            </div>
            {!escortDirectoryLoading && escortDirectory?.items.length === 0 && (
              <p className="mt-4 rounded-xl bg-black/20 p-8 text-center text-sm text-zinc-500">找不到符合條件的小姐。</p>
            )}
            {escortDirectory && escortDirectory.pagination.totalPages > 1 && (
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  disabled={escortDirectory.pagination.page <= 1 || escortDirectoryLoading}
                  onClick={() => setEscortPage((page) => Math.max(1, page - 1))}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm disabled:opacity-40"
                >
                  上一頁
                </button>
                <span className="text-sm text-zinc-500">
                  {escortDirectory.pagination.page} / {escortDirectory.pagination.totalPages}・共 {escortDirectory.pagination.total} 位
                </span>
                <button
                  type="button"
                  disabled={escortDirectory.pagination.page >= escortDirectory.pagination.totalPages || escortDirectoryLoading}
                  onClick={() => setEscortPage((page) => page + 1)}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm disabled:opacity-40"
                >
                  下一頁
                </button>
              </div>
            )}
          </section>
        )}

        {!readOnly && <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="font-medium">新增幹部帳號</h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="幹部名稱" maxLength={60} className="flex-1 rounded-xl border border-white/15 bg-black/30 px-4 py-3" />
            <button disabled={busy || nickname.trim().length < 2} onClick={() => act('create', undefined, { nickname })} className="rounded-xl bg-pink-500 px-5 py-3 font-medium disabled:opacity-50">建立並產生啟用碼</button>
          </div>
          {message && <p className="mt-4 break-all rounded-xl bg-black/30 p-3 text-sm text-amber-200">{message}</p>}
        </section>}

        <section className={`${readOnly ? 'mt-8' : 'mt-6'} overflow-hidden rounded-2xl border border-white/10 bg-white/5`}>
          <div className="border-b border-white/10 px-5 py-4 text-sm text-zinc-400">
            {readOnly
              ? '可查看所有幹部與人員統計，也可以設定只有自己看得到的私人名稱；無法修改正式名稱或執行帳號管理操作。'
              : '僅能管理幹部帳號；無法操作 A000、客戶資料、對話或系統設定。'}
            <input
              value={managerSearch}
              onChange={(event) => setManagerSearch(event.target.value)}
              placeholder={readOnly ? '搜尋幹部帳號、正式名稱或私人名稱' : '搜尋幹部帳號或名稱'}
              className="mt-3 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-600"
            />
          </div>
          <div className="divide-y divide-white/10">
            {managers.filter((manager) => {
              const query = managerSearch.trim().toLowerCase();
              return !query || [manager.key, manager.nickname, manager.privateName ?? '']
                .some((field) => field.toLowerCase().includes(query));
            }).map((manager) => (
              <div key={manager.key} className="grid gap-3 px-5 py-4 lg:grid-cols-[90px_1fr_auto] lg:items-center">
                <div className="font-mono text-pink-300">{manager.key}</div>
                <div>
                  {readOnly && manager.privateName ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{manager.privateName}</span>
                      <span className="rounded-full bg-pink-400/10 px-2 py-0.5 text-[10px] font-medium text-pink-300">我的稱呼</span>
                    </div>
                  ) : (
                    <div className="font-medium">{manager.nickname}</div>
                  )}
                  <div className="mt-1 text-xs text-zinc-500">
                    {readOnly && manager.privateName ? `系統名稱：${manager.nickname}・` : ''}
                    {manager.archived ? '已封存' : manager.disabled ? '已停用' : manager.hasPassword ? '已啟用' : '待啟用'}
                    {manager.mustChangeNickname ? '・登入後須改名' : ''}
                  </div>
                  {readOnly && editingPrivateName !== manager.key && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPrivateName(manager.key);
                        setPrivateNameDraft(manager.privateName ?? '');
                        setMessage('');
                      }}
                      className="mt-2 text-xs font-medium text-pink-300 hover:text-pink-200"
                    >
                      {manager.privateName ? '編輯我的稱呼' : '設定我的稱呼'}
                    </button>
                  )}
                  {readOnly && editingPrivateName === manager.key && (
                    <form
                      className="mt-3 flex max-w-lg flex-col gap-2 sm:flex-row sm:flex-wrap"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void savePrivateName(manager.key);
                      }}
                    >
                      <input
                        autoFocus
                        value={privateNameDraft}
                        onChange={(event) => setPrivateNameDraft(event.target.value)}
                        placeholder="輸入只有自己看得懂的名稱"
                        maxLength={60}
                        className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                      />
                      <div className="flex gap-2">
                        <button disabled={busy} type="submit" className="rounded-lg bg-pink-500 px-3 py-2 text-xs font-medium disabled:opacity-50">儲存</button>
                        <button
                          disabled={busy}
                          type="button"
                          onClick={() => {
                            setEditingPrivateName(null);
                            setPrivateNameDraft('');
                          }}
                          className="rounded-lg border border-white/15 px-3 py-2 text-xs disabled:opacity-50"
                        >
                          取消
                        </button>
                      </div>
                      <p className="text-[10px] text-zinc-500 sm:basis-full">留空並儲存即可清除；這個名稱只有 A777 看得到。</p>
                    </form>
                  )}
                </div>
                {readOnly && (() => {
                  const roster = rosters.find((item) => item.managerKey === manager.key);
                  const expanded = expandedManager === manager.key;
                  return (
                    <div className="lg:min-w-80">
                      <button
                        type="button"
                        onClick={() => setExpandedManager(expanded ? null : manager.key)}
                        className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-left transition hover:border-pink-400/30"
                        aria-expanded={expanded}
                      >
                        <span className="text-sm">
                          <span className="font-medium text-white">現有人員 {roster?.activeCount ?? 0} 位</span>
                        </span>
                        <span className="shrink-0 text-xs text-pink-300">查看名單 {expanded ? '▲' : '▼'}</span>
                      </button>
                      {expanded && (
                        <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-black/30 p-3">
                          {roster?.members.length ? roster.members.map((member, index) => {
                            const status = ROSTER_STATUS[member.status];
                            return (
                              <div key={`${member.nickname}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2">
                                <span className="min-w-0 truncate text-sm text-zinc-200">{member.nickname}</span>
                                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${status.className}`}>{status.label}</span>
                              </div>
                            );
                          }) : <p className="px-1 py-2 text-sm text-zinc-500">尚未建立小姐</p>}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {!readOnly && <div className="flex flex-wrap gap-2 text-xs">
                  <button disabled={busy} onClick={() => { const next = window.prompt('新名稱', manager.nickname); if (next) void act('edit', manager.key, { nickname: next }); }} className="rounded-lg border border-white/15 px-3 py-2">改名</button>
                  <button disabled={busy} onClick={() => act('activate', manager.key)} className="rounded-lg border border-amber-400/30 px-3 py-2 text-amber-200">重設／啟用碼</button>
                  <button disabled={busy} onClick={() => act(manager.disabled ? 'enable' : 'disable', manager.key)} className="rounded-lg border border-white/15 px-3 py-2">{manager.disabled ? '啟用' : '停用'}</button>
                  <button disabled={busy} onClick={() => act(manager.archived ? 'unarchive' : 'archive', manager.key)} className="rounded-lg border border-white/15 px-3 py-2">{manager.archived ? '解除封存' : '封存'}</button>
                  <button disabled={busy} onClick={() => act('logout', manager.key)} className="rounded-lg border border-white/15 px-3 py-2">登出裝置</button>
                </div>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
