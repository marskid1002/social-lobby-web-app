'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAppState } from '@/lib/state';
import TermsConsent from '@/components/legal/terms-consent';
import { TERMS_VERSION } from '@/lib/legal';
import { isTaiwanMobile, normalizeTaiwanMobile } from '@/lib/phone';
import styles from './login.module.css';

type Mode = 'login' | 'register' | 'reset';

export default function LoginPage() {
  const router = useRouter();
  // 登入頁尚未有有效 session，不得啟動需要授權的跨裝置資料同步。
  const { registerCustomer, loginCustomer, switchUser } = useAppState({ sync: false });

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
  const [termsAccepted, setTermsAccepted] = useState(false);

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
    if (!isTaiwanMobile(phone)) { setError('請輸入有效台灣手機號碼'); return; }
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
      if (u.role === 'account_admin' || u.role === 'account_viewer') { setTimeout(() => router.push('/account-admin'), 250); return; }
      if (u.role === 'manager') switchUser(u.id);
      else loginCustomer(u.id, u.nickname);
      setTimeout(() => router.push(u.mustChangeNickname ? '/complete-profile' : '/lobby/explore'), 250);
    } catch { setError('連線失敗'); } finally { setBusy(false); }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (code.trim().length < 4) { setError('請先輸入簡訊驗證碼'); return; }
    if (!termsAccepted) { setError('請先閱讀並同意平台規範'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          phone,
          password,
          nickname,
          code,
          ageConfirmed: true,
          termsAccepted: true,
          termsVersion: TERMS_VERSION,
        }),
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
      setAccount(normalizeTaiwanMobile(phone));
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

  const inputCls = styles.input;
  const otpBtnCls = styles.otpButton;

  // 手機 + 發送驗證碼 一組（註冊/重設共用）。用一般函式回傳 JSX（非內嵌元件），避免輸入時失焦。
  const otpRow = (purpose: 'register' | 'reset') => (
    <>
      <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="手機號碼（09 或 +886）" className={inputCls} aria-label="手機號碼" />
      <div className="flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="簡訊驗證碼" className={inputCls} aria-label="簡訊驗證碼" />
        <button type="button" onClick={() => sendOtp(purpose)} disabled={otpBusy || cooldown > 0} className={otpBtnCls}>
          {cooldown > 0 ? `${cooldown} 秒` : (otpBusy ? '發送中' : '發送驗證碼')}
        </button>
      </div>
    </>
  );

  return (
    <div className={styles.page}>
      <div className={styles.ambientPink} />
      <div className={styles.ambientViolet} />
      <div className={styles.content}>
        <div className={styles.brandBlock}>
          <div className={styles.logoFrame}>
            <Image src="/icons/icon-192.png" width={96} height={96} alt="JUGA" priority />
          </div>
          <div className={styles.wordmark}>
            <span>JUGA</span>
            <small>START A GOOD GATHERING</small>
          </div>
          <h1>
            <span>今晚有局，</span>
            <span className={styles.whiteLine}>因為有你</span>
          </h1>
        </div>

          {/* 登入 / 註冊 切換 */}
          <div className={styles.authCard}>
            <div className={styles.modeTabs}>
              <button
                onClick={() => switchMode('login')}
                className={mode === 'login' ? styles.activeTab : ''}
              >
                登入
              </button>
              <button
                onClick={() => switchMode('register')}
                className={mode === 'register' ? styles.activeTab : ''}
              >
                客戶註冊
              </button>
            </div>

            {mode === 'login' && (
              <form onSubmit={handleLogin} className={styles.form}>
                <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="帳號" className={inputCls} aria-label="帳號" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密碼" className={inputCls} aria-label="密碼" />
                {needActivation && (
                  <input
                    value={activationCode}
                    onChange={(e) => setActivationCode(e.target.value)}
                    placeholder="一次性啟用碼（首次登入）"
                    className={inputCls}
                    aria-label="一次性啟用碼"
                  />
                )}
                {info && <p className={styles.info}>{info}</p>}
                {error && <p className={styles.error}>{error}</p>}
                <button type="submit" disabled={busy} className={styles.primaryButton}>
                  {busy ? '登入中…' : '登入'}
                </button>
                <button type="button" onClick={() => switchMode('reset')} className={styles.textButton}>
                  忘記密碼？
                </button>
              </form>
            )}

            {mode === 'register' && (
              <form onSubmit={handleRegister} className={styles.form}>
                {otpRow('register')}
                <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="暱稱" className={inputCls} aria-label="暱稱" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密碼（至少 6 碼）" className={inputCls} aria-label="密碼" />
                <div className={styles.termsWrap}><TermsConsent accepted={termsAccepted} onAcceptedChange={setTermsAccepted} /></div>
                {info && <p className={styles.info}>{info}</p>}
                {error && <p className={styles.error}>{error}</p>}
                <button type="submit" disabled={busy || !termsAccepted} className={styles.primaryButton}>
                  {busy ? '註冊中…' : '註冊並開始'}
                </button>
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={handleReset} className={styles.form}>
                <p className={styles.formTitle}>用手機簡訊重設密碼</p>
                {otpRow('reset')}
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="新密碼（至少 6 碼）" className={inputCls} aria-label="新密碼" />
                {info && <p className={styles.info}>{info}</p>}
                {error && <p className={styles.error}>{error}</p>}
                <button type="submit" disabled={busy} className={styles.primaryButton}>
                  {busy ? '處理中…' : '重設密碼'}
                </button>
                <button type="button" onClick={() => switchMode('login')} className={`${styles.textButton} ${styles.textButtonLeft}`}>
                  ← 返回登入
                </button>
                <p className={styles.helper}>幹部/管理員帳號請聯絡管理員重設，不適用簡訊重設。</p>
              </form>
            )}
          </div>

          {/* 訪客瀏覽 */}
          <button
            onClick={handleGuest}
            disabled={busy}
            className={styles.guestButton}
          >
            訪客瀏覽
          </button>

          <p className={styles.legalLinks}>
            查看
            <Link href="/legal/terms">平台服務條款</Link>
            與
            <Link href="/legal/privacy">隱私權政策</Link>
            <br />本平台限 18 歲以上使用
          </p>
      </div>
    </div>
  );
}
