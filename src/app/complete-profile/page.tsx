'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';

export default function CompleteProfilePage() {
  const router = useRouter();
  const { switchUser } = useAppState({ sync: false });
  const [account, setAccount] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/account', { cache: 'no-store' })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!response.ok) return router.replace('/login');
        setAccount(data.account);
        setNickname(data.nickname ?? '');
        if (!data.mustChangeNickname) router.replace('/lobby/explore');
      })
      .catch(() => setError('目前無法讀取帳號資料'));
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname }),
      });
      const data = await response.json();
      if (!response.ok) return setError(data.error ?? '更新失敗');
      const session = await fetch('/api/auth', { cache: 'no-store' }).then((item) => item.json());
      if (session.user?.id) switchUser(session.user.id);
      router.replace('/lobby/explore');
    } catch {
      setError('連線失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-5 py-16 text-white">
      <form onSubmit={submit} className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/5 p-7 shadow-2xl">
        <p className="text-sm text-pink-300">{account || '幹部帳號'}</p>
        <h1 className="mt-2 text-2xl font-semibold">首次登入，請設定你的名稱</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">這個名稱會顯示在站內。設定完成後才能進入正式功能。</p>
        <label className="mt-7 block text-sm text-zinc-300" htmlFor="nickname">顯示名稱</label>
        <input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={60} autoFocus className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 outline-none focus:border-pink-400" />
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <button disabled={busy} className="mt-6 w-full rounded-xl bg-pink-500 px-4 py-3 font-medium disabled:opacity-50">{busy ? '儲存中…' : '儲存並進入'}</button>
      </form>
    </main>
  );
}
