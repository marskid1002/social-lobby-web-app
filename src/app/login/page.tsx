'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';

type Mode = 'login' | 'register' | 'reset';

export default function LoginPage() {
  const router = useRouter();
  const { registerCustomer, loginCustomer, switchUser } = useAppState();

  const [mode, setMode] = useState<Mode>('login');
  const [account, setAccount] = useState(''); // 手機 或 A001
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');             // 簡訊驗證碼
  const [activationCode, setActivationCode] = useState('');
  const [needActivation, setNeedActivation] = useState(false); // 幹部首次登入需啟用碼
  const [busy, setBusy] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);      // 重新發送倒數（秒）
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');             // 成功/提示訊息（綠字）

  // 發送驗證碼倒數
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setInfo('');
    setCode('');
    setNeedActivation(false);
  }

  // 發送簡訊驗證碼（註冊 / 忘記密碼共用）
  async function sendOtp(purpose: 'register' | 'reset') {
    setError('');
    setInfo('');
    if (phone.replace(/\D/g, '').length < 8) { setError('請輸入有效手機號碼'); return; }
    setOtpBusy(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-otp', purpose, phone }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.error ?? '無法發送驗證碼'); return; }
      setCooldown(60);
      // 本地測試模式後端會回傳 devCode；生產不會
      setInfo(data.devCode ? `測試模式：驗證碼為 ${data.devCode}` : '驗證碼已發送，請查看手機簡訊');
    } catch { setError('連線失敗'); } finally { setOtpBusy(false); }
  }

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
      if (u.role === 'admin') { switchUser(u.id); setTimeout(() => router.push('/admin'), 250); return; }
      if (u.role === 'manager') switchUser(u.id);
      else loginCustomer(u.id, u.nickname);
      setTimeout(() => router.push('/lobby/explore'), 250);
    } catch { setError('連線失敗'); } finally { setBusy(false); }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (code.trim().length < 4) { setError('請先輸入簡訊驗證碼'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', phone, password, nickname, code }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.error ?? '註冊失敗'); return; }
      registerCustomer(data.user.id, data.user.nickname);
      setTimeout(() => router.push('/onboarding'), 250);
    } catch { setError('連線失敗'); } finally { setBusy(false); }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (code.trim().length < 4) { setError('請先輸入簡訊驗證碼'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-password', phone, code, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.error ?? '重設失敗'); return; }
      setInfo('密碼已重設，請用新密碼登入');
      setMode('login');
      setAccount(phone);
      setPassword('');
      setCode('');
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
  const otpBtnCls =
    'shrink-0 px-3 rounded-xl bg-brand-sky text-brand-ink text-xs font-bold active:scale-[0.98] transition-transform disabled:opacity-50 whitespace-nowrap';

  // 手機 + 發送驗證碼 一組（註冊/重設共用）。用一般函式回傳 JSX（非內嵌元件），避免輸入時失焦。
  const otpRow = (purpose: 'register' | 'reset') => (
    <>
      <input type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="手機號碼" className={inputCls} aria-label="手機號碼" />
      <div className="flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="簡訊驗證碼" className={inputCls} aria-label="簡訊驗證碼" />
        <button type="button" onClick={() => sendOtp(purpose)} disabled={otpBusy || cooldown > 0} className={otpBtnCls}>
          {cooldown > 0 ? `${cooldown} 秒` : (otpBusy ? '發送中' : '發送驗證碼')}
        </button>
      </div>
    </>
  );

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
                onClick={() => switchMode('login')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${mode === 'login' ? 'bg-white text-brand-ink shadow-sm' : 'text-zinc-400'}`}
              >
                登入
              </button>
              <button
                onClick={() => switchMode('register')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${mode === 'register' ? 'bg-white text-brand-ink shadow-sm' : 'text-zinc-400'}`}
              >
                客戶註冊
              </button>
            </div>

            {mode === 'login' && (
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
                {info && <p className="text-xs text-green-600 font-semibold">{info}</p>}
                {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
                <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-line-green text-white text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-60">
                  {busy ? '登入中…' : '登入'}
                </button>
                <button type="button" onClick={() => switchMode('reset')} className="text-xs text-zinc-400 underline self-end">
                  忘記密碼？
                </button>
              </form>
            )}

            {mode === 'register' && (
              <form onSubmit={handleRegister} className="flex flex-col gap-2.5">
                {otpRow('register')}
                <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="暱稱" className={inputCls} aria-label="暱稱" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密碼（至少 6 碼）" className={inputCls} aria-label="密碼" />
                {info && <p className="text-xs text-green-600 font-semibold">{info}</p>}
                {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
                <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-line-green text-white text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-60">
                  {busy ? '註冊中…' : '註冊並開始'}
                </button>
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={handleReset} className="flex flex-col gap-2.5">
                <p className="text-sm font-bold text-brand-ink">用手機簡訊重設密碼</p>
                {otpRow('reset')}
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="新密碼（至少 6 碼）" className={inputCls} aria-label="新密碼" />
                {info && <p className="text-xs text-green-600 font-semibold">{info}</p>}
                {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
                <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-line-green text-white text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-60">
                  {busy ? '處理中…' : '重設密碼'}
                </button>
                <button type="button" onClick={() => switchMode('login')} className="text-xs text-zinc-400 underline self-start">
                  ← 返回登入
                </button>
                <p className="text-xs text-zinc-400 leading-relaxed">幹部/管理員帳號請聯絡管理員重設，不適用簡訊重設。</p>
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
