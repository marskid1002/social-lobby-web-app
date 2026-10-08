'use client';

import { useState, type FormEvent } from 'react';

export default function AdminCustomerForm({ disabled, onCreated }: {
  disabled: boolean;
  onCreated: (account: string) => Promise<void>;
}) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState('');
  const inputClass = 'mt-1 w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled) return;
    setBusy(true);
    setError('');
    setCreated('');
    try {
      const response = await fetch('/api/admin/customers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, password, nickname }),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error || '建立失敗'); return; }
      setCreated(result.account);
      setAccount(''); setPassword(''); setNickname('');
      await onCreated(result.account).catch(() => {});
    } catch {
      setError('連線中斷，請先搜尋帳號確認是否已建立，再決定是否重試');
    } finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
    <h2 className="text-sm font-bold text-sky-900">新增一般用戶</h2>
    <p className="mt-1 text-xs text-sky-700">免手機驗證，適合海外客戶或試用。建立後可直接登入；忘記密碼時請由管理員重設。</p>
    <fieldset disabled={busy || disabled} className="mt-3 grid gap-3 sm:grid-cols-3 disabled:opacity-60">
      <label className="text-xs font-medium text-sky-900">登入帳號
        <input className={inputClass} value={account} onChange={(e) => setAccount(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} required minLength={4} maxLength={32} pattern="[A-Za-z][A-Za-z0-9_\-]{3,31}" placeholder="例如 HK_GUEST01" aria-describedby="customer-account-hint" />
      </label>
      <label className="text-xs font-medium text-sky-900">密碼
        <input className={inputClass} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} maxLength={128} aria-describedby="customer-password-hint" />
      </label>
      <label className="text-xs font-medium text-sky-900">暱稱
        <input className={inputClass} value={nickname} onChange={(e) => setNickname(e.target.value)} required maxLength={60} placeholder="例如 香港客戶" />
      </label>
      <div className="text-xs text-sky-700 sm:col-span-3">
        <p id="customer-account-hint">帳號不分大小寫，以英文字母開頭，4～32 碼英數字、底線或連字號；不可使用 A 加純數字。</p>
        <p id="customer-password-hint" className="mt-1">密碼 6～128 碼，需包含大寫、小寫、數字與符號。</p>
      </div>
      <button type="submit" className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white sm:col-span-3">{busy ? '建立中…' : '建立一般用戶'}</button>
    </fieldset>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {created && <p role="status" className="mt-3 text-sm text-emerald-800">已建立 {created}，請將帳號與剛設定的密碼交給客戶，在 /login 選擇「登入」即可。</p>}
  </form>;
}
