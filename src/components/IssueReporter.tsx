'use client';

import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { MessageCircleWarning, X } from 'lucide-react';

export function IssueReporter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    if (!description.trim()) {
      setMessage('請簡短說明發生的問題');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const threadId = pathname.startsWith('/chat/')
        ? decodeURIComponent(pathname.slice('/chat/'.length))
        : undefined;
      const response = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          description,
          page: `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`,
          requestId: searchParams.get('req') ?? undefined,
          threadId,
          lastErrorCode: window.sessionStorage.getItem('sl:last-sync-error') ?? undefined,
        }),
      });
      const result = await response.json().catch(() => null) as { error?: string; traceId?: string } | null;
      if (!response.ok) throw new Error(result?.error || '回報失敗');
      setDescription('');
      setMessage(`已送出${result?.traceId ? `，追蹤碼：${result.traceId}` : ''}`);
      window.setTimeout(() => { setOpen(false); setMessage(''); }, 1800);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '回報失敗');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 left-[max(12px,calc(50%-203px))] z-40 flex items-center gap-1 rounded-full border border-zinc-200 bg-white/95 px-3 py-2 text-[11px] font-bold text-zinc-600 shadow-md backdrop-blur"
        aria-label="回報問題"
      >
        <MessageCircleWarning size={15} />
        回報問題
      </button>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/35 p-3 sm:items-center">
          <div className="app-bottom-sheet w-full max-w-[410px] overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-zinc-900">回報問題</h2>
                <p className="mt-1 text-xs text-zinc-500">系統會自動附上頁面、裝置與流程追蹤碼。</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-zinc-500">
                <X size={18} />
              </button>
            </div>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value.slice(0, 1000))}
              placeholder="請描述你看到的狀況"
              rows={4}
              className="mt-4 w-full resize-none rounded-2xl border border-zinc-200 p-3 text-sm outline-none focus:border-sky-400"
            />
            {message && <p className="mt-2 break-all text-xs text-zinc-600">{message}</p>}
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="mt-4 w-full rounded-xl bg-sky-600 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? '送出中…' : '送出回報'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
