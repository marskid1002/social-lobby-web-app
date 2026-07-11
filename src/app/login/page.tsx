'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';

type Mode = 'login' | 'register';

export default function LoginPage() {
  const router = useRouter();
  const { registerCustomer, loginCustomer, switchUser } = useAppState();

  const [mode, setMode] = useState<Mode>('login');
  const [account, setAccount] = useState(''); // 手機 或 A001
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [needActivation, setNeedActivation] = useState(false); // 幹部首次登入需啟用碼
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', account, password, activationCode }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.needActivation) setNeedActivation(true); // 顯示啟用碼欄位
        setError(data.error ?? '登入失敗');
        return;
      }
      const u = data.user;
      if (u.role === 'manager') switchUser(u.id);
      else loginCustomer(u.id, u.nickname);
      setTimeout(() => router.push('/lobby/explore'), 250);
    } catch { setError('連線失敗'); } finally { setBusy(false); }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', phone, password, nickname }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.error ?? '註冊失敗'); return; }
      registerCustomer(data.user.id, data.user.nickname);
      setTimeout(() => router.push('/onboarding'), 250);
    } catch { setError('連線失敗'); } finally { setBusy(false); }
  }

  async function handleGuest() {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'guest' }),
      });
      if (!res.ok) { setError('無法進入'); return; }
      switchUser('u-099');
      setTimeout(() => router.push('/lobby/explore'), 250);
    } catch { setError('連線失敗'); } finally { setBusy(false); }
  }

  const inputCls =
    'w-full rounded-xl border border-brand-lavender bg-brand-snow px-4 py-3 text-sm text-brand-ink focus:outline-none focus:border-brand-sky';

  return (
    <div className="min-h-screen flex flex-col bg-brand-snow">
      <div className="relative flex-1 flex flex-col items-center px-6 pb-10 pt-16">
        <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-card-a opacity-60 rounded-b-[60px]" />
        <div className="relative z-10 flex flex-col items-center w-full max-w-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-gradient-sky-pink flex items-center justify-center shadow-fab">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <span className="text-2xl font-bold text-brand-ink tracking-tight">Social Lobby</span>
          </div>
          <p className="text-zinc-500 text-sm mb-8">今晚一起出去吧</p>

          {/* 登入 / 註冊 切換 */}
          <div className="w-full bg-white rounded-2xl border border-brand-lavender shadow-sm p-4 mb-4">
            <div className="flex bg-brand-snow rounded-xl p-1 mb-4">
              <button
                onClick={() => { setMode('login'); setError(''); }}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${mode === 'login' ? 'bg-white text-brand-ink shadow-sm' : 'text-zinc-400'}`}
              >
                登入
              </button>
              <button
                onClick={() => { setMode('register'); setError(''); }}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${mode === 'register' ? 'bg-white text-brand-ink shadow-sm' : 'text-zinc-400'}`}
              >
                客戶註冊
              </button>
            </div>

            {mode === 'login' ? (
              <form onSubmit={handleLogin} className="flex flex-col gap-2.5">
                <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="帳號" className={inputCls} aria-label="帳號" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密碼" className={inputCls} aria-label="密碼" />
                {needActivation && (
                  <input
                    value={activationCode}
                    onChange={(e) => setActivationCode(e.target.value)}
                    placeholder="幹部啟用碼（首次登入）"
                    className={inputCls}
                    aria-label="幹部啟用碼"
                  />
                )}
                {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
                <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-line-green text-white text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-60">
                  {busy ? '登入中…' : '登入'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="flex flex-col gap-2.5">
                <input type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="手機號碼" className={inputCls} aria-label="手機號碼" />
                <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="暱稱" className={inputCls} aria-label="暱稱" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密碼（至少 6 碼）" className={inputCls} aria-label="密碼" />
                {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
                <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-line-green text-white text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-60">
                  {busy ? '註冊中…' : '註冊並開始'}
                </button>
              </form>
            )}
          </div>

          {/* 訪客瀏覽 */}
          <button
            onClick={handleGuest}
            disabled={busy}
            className="w-full py-3 rounded-2xl bg-white border-2 border-brand-lavender text-sm font-bold text-brand-ink active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            訪客瀏覽
          </button>

          <p className="text-xs text-zinc-400 text-center mt-6 leading-relaxed">
            登入即表示你同意
            <a href="/legal/terms" className="underline text-zinc-500">服務條款</a>
            與
            <a href="/legal/privacy" className="underline text-zinc-500">隱私權政策</a>
            <br />本平台限 18 歲以上使用
          </p>
        </div>
      </div>
    </div>
  );
}
