'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Manager = {
  key: string;
  nickname: string;
  hasPassword: boolean;
  disabled: boolean;
  archived: boolean;
  mustChangeNickname: boolean;
};

export default function AccountAdminPage() {
  const router = useRouter();
  const [managers, setManagers] = useState<Manager[]>([]);
  const [nickname, setNickname] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/account-admin', { cache: 'no-store' });
    if (response.status === 401 || response.status === 403) return router.replace('/login');
    const data = await response.json();
    setManagers(data.managers ?? []);
  }, [router]);

  useEffect(() => { void load(); }, [load]);

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
        setMessage(`${data.account} 一次性啟用碼：${data.activationCode}（24 小時內使用，只顯示這一次）`);
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

  async function logout() {
    await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
    router.replace('/login');
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <div><p className="text-sm text-pink-300">A888</p><h1 className="text-2xl font-semibold">幹部帳號管理</h1></div>
          <button onClick={logout} className="rounded-lg border border-white/15 px-4 py-2 text-sm">登出</button>
        </header>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="font-medium">新增幹部帳號</h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="幹部名稱" maxLength={60} className="flex-1 rounded-xl border border-white/15 bg-black/30 px-4 py-3" />
            <button disabled={busy || nickname.trim().length < 2} onClick={() => act('create', undefined, { nickname })} className="rounded-xl bg-pink-500 px-5 py-3 font-medium disabled:opacity-50">建立並產生啟用碼</button>
          </div>
          {message && <p className="mt-4 break-all rounded-xl bg-black/30 p-3 text-sm text-amber-200">{message}</p>}
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-5 py-4 text-sm text-zinc-400">僅能管理幹部帳號；無法操作 A000、客戶資料、對話或系統設定。</div>
          <div className="divide-y divide-white/10">
            {managers.map((manager) => (
              <div key={manager.key} className="grid gap-3 px-5 py-4 lg:grid-cols-[90px_1fr_auto] lg:items-center">
                <div className="font-mono text-pink-300">{manager.key}</div>
                <div>
                  <div className="font-medium">{manager.nickname}</div>
                  <div className="mt-1 text-xs text-zinc-500">{manager.archived ? '已封存' : manager.disabled ? '已停用' : manager.hasPassword ? '已啟用' : '待啟用'}{manager.mustChangeNickname ? '・登入後須改名' : ''}</div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button disabled={busy} onClick={() => { const next = window.prompt('新名稱', manager.nickname); if (next) void act('edit', manager.key, { nickname: next }); }} className="rounded-lg border border-white/15 px-3 py-2">改名</button>
                  <button disabled={busy} onClick={() => act('activate', manager.key)} className="rounded-lg border border-amber-400/30 px-3 py-2 text-amber-200">重設／啟用碼</button>
                  <button disabled={busy} onClick={() => act(manager.disabled ? 'enable' : 'disable', manager.key)} className="rounded-lg border border-white/15 px-3 py-2">{manager.disabled ? '啟用' : '停用'}</button>
                  <button disabled={busy} onClick={() => act(manager.archived ? 'unarchive' : 'archive', manager.key)} className="rounded-lg border border-white/15 px-3 py-2">{manager.archived ? '解除封存' : '封存'}</button>
                  <button disabled={busy} onClick={() => act('logout', manager.key)} className="rounded-lg border border-white/15 px-3 py-2">登出裝置</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
