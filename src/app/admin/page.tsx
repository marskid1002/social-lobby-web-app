'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type Account = {
  key: string;
  role: 'user' | 'manager' | 'admin';
  tier: string;
  userId: string;
  nickname: string;
  hasPassword: boolean;
  disabled: boolean;
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

const ROLE_LABEL: Record<string, string> = { admin: '管理員', manager: '幹部', user: '客戶' };

export default function AdminPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [tempPw, setTempPw] = useState<{ key: string; pw: string } | null>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const load = useCallback(async () => {
    setError('');
    const res = await fetch('/api/admin', { cache: 'no-store' });
    if (res.status === 403) { setError('需以管理員身份登入'); setAccounts([]); return; }
    if (!res.ok) { setError('載入失敗'); setAccounts([]); return; }
    const data = await res.json();
    setAccounts(data.accounts ?? []);
    setReports(data.reports ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(account: string, action: string) {
    setBusy(account + action);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, account }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { showToast(data.error ?? '操作失敗'); return; }
      if (data.tempPassword) setTempPw({ key: account, pw: data.tempPassword }); // 客戶重設 → 顯示臨時密碼
      else showToast('已完成');
      await load();
    } catch { showToast('連線失敗'); } finally { setBusy(''); }
  }

  async function resolveReport(reportId: string, resolved: boolean) {
    setBusy(reportId);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: resolved ? 'resolve-report' : 'reopen-report', reportId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { showToast(data.error ?? '操作失敗'); return; }
      await load();
    } catch { showToast('連線失敗'); } finally { setBusy(''); }
  }

  async function confirmDelete() {
    if (!deleteTarget || confirmText !== deleteTarget.key) return;
    const target = deleteTarget;
    setDeleteTarget(null); setConfirmText('');
    await act(target.key, 'delete');
  }

  async function clearBoards() {
    if (typeof window !== 'undefined' &&
      !window.confirm('確定清除所有「局 / 邀請 / 通知 / 對話」？\n（會保留小姐、照片、帳號）此動作無法復原。')) return;
    setBusy('clear-shared');
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear-shared' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { showToast(data.error ?? '清除失敗'); return; }
      showToast('已清除所有局與對話');
      await load();
    } catch { showToast('連線失敗'); } finally { setBusy(''); }
  }

  const cls = 'text-xs font-semibold px-2.5 py-1 rounded-full border';

  return (
    <div className="min-h-screen bg-brand-snow">
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-brand-lavender px-4 py-3 flex items-center justify-between">
        <h1 className="text-base font-bold text-brand-ink">管理後台</h1>
        <button onClick={() => router.push('/lobby/explore')} className="text-xs text-brand-sky font-semibold">回前台</button>
      </div>

      <div className="px-4 py-4">
        {error && (
          <div className="bg-white rounded-2xl p-5 text-center">
            <p className="text-sm text-red-500 font-semibold mb-3">{error}</p>
            <button onClick={() => router.push('/login')} className="px-4 py-2 rounded-xl bg-line-green text-white text-sm font-bold">前往登入</button>
          </div>
        )}

        {accounts && !error && (
          <>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">帳號管理（{accounts.length}）</p>
            <div className="flex flex-col gap-2">
              {accounts.map((a) => (
                <div key={a.key} className="bg-white rounded-2xl border border-brand-lavender p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-bold text-brand-ink">{a.nickname}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-ice text-zinc-500">{ROLE_LABEL[a.role] ?? a.role}</span>
                    <span className="text-xs text-zinc-400">{a.key}</span>
                    {a.disabled && <span className="text-[10px] font-bold text-red-500">已停用</span>}
                    {!a.hasPassword && a.role !== 'user' && <span className="text-[10px] text-amber-600">未設密碼</span>}
                  </div>
                  {a.role !== 'admin' && (
                    <div className="flex flex-wrap gap-2">
                      <button disabled={!!busy} onClick={() => act(a.key, 'reset')} className={`${cls} border-brand-sky text-brand-sky`}>重設密碼</button>
                      {a.disabled ? (
                        <button disabled={!!busy} onClick={() => act(a.key, 'enable')} className={`${cls} border-status-available text-status-available`}>啟用</button>
                      ) : (
                        <button disabled={!!busy} onClick={() => act(a.key, 'disable')} className={`${cls} border-amber-500 text-amber-600`}>停用</button>
                      )}
                      {a.role === 'user' && (
                        <button disabled={!!busy} onClick={() => { setDeleteTarget(a); setConfirmText(''); }} className={`${cls} border-red-300 text-red-500`}>刪除</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {reports.length > 0 && (
              <>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2 mt-6">
                  檢舉（{reports.filter((r) => !r.resolved).length} 待處理 / {reports.length}）
                </p>
                <div className="flex flex-col gap-2">
                  {reports.map((r) => {
                    const targetAcc = accounts.find((a) => a.userId === r.targetId);
                    return (
                      <div key={r.id} className={`bg-white rounded-2xl border p-3 ${r.resolved ? 'border-brand-lavender opacity-60' : 'border-red-200'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-brand-ink">被檢舉：{r.targetName ?? r.targetId}</span>
                          {r.resolved && <span className="text-[10px] font-bold text-status-available">已處理</span>}
                        </div>
                        <p className="text-xs text-zinc-500">檢舉人：{r.reporterId}</p>
                        {r.reason && <p className="text-xs text-zinc-600 mt-1">原因：{r.reason}</p>}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {!r.resolved ? (
                            <button disabled={!!busy} onClick={() => resolveReport(r.id, true)} className={`${cls} border-status-available text-status-available`}>標記已處理</button>
                          ) : (
                            <button disabled={!!busy} onClick={() => resolveReport(r.id, false)} className={`${cls} border-zinc-300 text-zinc-500`}>重新開啟</button>
                          )}
                          {targetAcc && !targetAcc.disabled && targetAcc.role !== 'admin' && (
                            <button disabled={!!busy} onClick={() => act(targetAcc.key, 'disable')} className={`${cls} border-amber-500 text-amber-600`}>停用對方</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* 資料維護 */}
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2 mt-6">資料維護</p>
            <div className="bg-white rounded-2xl border border-brand-lavender p-3">
              <p className="text-sm font-semibold text-brand-ink mb-1">清除所有局與對話</p>
              <p className="text-xs text-zinc-400 mb-3">清掉所有邀請的局、回應、通知與聊天訊息；保留小姐、照片、帳號。用於測試重來。</p>
              <button disabled={!!busy} onClick={clearBoards} className={`${cls} border-red-300 text-red-500`}>
                {busy === 'clear-shared' ? '清除中…' : '清除所有局與對話'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* 刪除二次確認 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setDeleteTarget(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-brand-ink mb-1">永久刪除帳號</h3>
            <p className="text-sm text-zinc-500 mb-1">將刪除 <b>{deleteTarget.nickname}</b>（{deleteTarget.key}）及其所有資料，<b className="text-red-500">不可復原</b>。</p>
            <p className="text-xs text-zinc-400 mb-3">請輸入帳號 <b>{deleteTarget.key}</b> 以確認：</p>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={deleteTarget.key}
              className="w-full rounded-xl border border-brand-lavender px-3 py-2 text-sm mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-2xl bg-brand-snow text-zinc-500 font-semibold text-sm">取消</button>
              <button onClick={confirmDelete} disabled={confirmText !== deleteTarget.key} className="flex-1 py-2.5 rounded-2xl bg-red-500 text-white font-semibold text-sm disabled:opacity-40">永久刪除</button>
            </div>
          </div>
        </div>
      )}

      {/* 客戶臨時密碼（重設後顯示，管理員轉告客戶）*/}
      {tempPw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setTempPw(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-brand-ink mb-1">已重設密碼</h3>
            <p className="text-sm text-zinc-500 mb-3">帳號 <b>{tempPw.key}</b> 的臨時新密碼如下，請轉告客戶用它登入（即為新密碼）：</p>
            <div className="flex items-center gap-2 mb-4">
              <code className="flex-1 text-center text-lg font-bold tracking-wider bg-brand-ice rounded-xl py-3 text-brand-ink select-all">{tempPw.pw}</code>
              <button
                onClick={() => { navigator.clipboard?.writeText(tempPw.pw); showToast('已複製'); }}
                className="shrink-0 px-3 py-3 rounded-xl bg-brand-sky text-brand-ink text-sm font-bold active:scale-95"
              >複製</button>
            </div>
            <button onClick={() => setTempPw(null)} className="w-full py-2.5 rounded-2xl bg-brand-snow text-zinc-600 font-semibold text-sm">關閉</button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-brand-ink text-white text-sm rounded-full px-5 py-2.5 shadow-lg z-[100]">{toast}</div>
      )}
    </div>
  );
}
