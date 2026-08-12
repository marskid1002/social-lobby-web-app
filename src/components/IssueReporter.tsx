'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Camera, MessageCircleWarning, Trash2, X } from 'lucide-react';
import { downscaleToJpegDataUrl } from '@/lib/image';

type PendingScreenshot = {
  file: File;
  previewUrl: string;
};

const MAX_SCREENSHOTS = 3;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const ALLOWED_SCREENSHOT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function prepareScreenshot(file: File): Promise<string> {
  const attempts = [
    { maxDim: 1200, quality: 0.72 },
    { maxDim: 960, quality: 0.65 },
    { maxDim: 720, quality: 0.58 },
  ];
  for (const attempt of attempts) {
    const dataUrl = await downscaleToJpegDataUrl(file, attempt.maxDim, attempt.quality);
    if (dataUrl.length <= 1_200_000) return dataUrl;
  }
  throw new Error('截圖檔案過大，請裁切後再試');
}

export function IssueReporter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [screenshots, setScreenshots] = useState<PendingScreenshot[]>([]);
  const screenshotsRef = useRef<PendingScreenshot[]>([]);

  useEffect(() => {
    screenshotsRef.current = screenshots;
  }, [screenshots]);

  useEffect(() => () => {
    screenshotsRef.current.forEach((screenshot) => URL.revokeObjectURL(screenshot.previewUrl));
  }, []);

  function addScreenshots(files: FileList | null) {
    if (!files?.length) return;
    const remaining = MAX_SCREENSHOTS - screenshots.length;
    const selected = Array.from(files).slice(0, remaining);
    const invalid = selected.find((file) => !ALLOWED_SCREENSHOT_TYPES.has(file.type) || file.size > MAX_SOURCE_BYTES);
    if (invalid) {
      setMessage('僅支援 JPG、PNG、WebP，每張原始檔最多 10MB');
      return;
    }
    setScreenshots((current) => [
      ...current,
      ...selected.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ]);
    setMessage(files.length > remaining ? `截圖最多 ${MAX_SCREENSHOTS} 張` : '');
  }

  function removeScreenshot(index: number) {
    setScreenshots((current) => {
      URL.revokeObjectURL(current[index].previewUrl);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  async function submit() {
    if (!description.trim()) {
      setMessage('請簡短說明發生的問題');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const preparedScreenshots = await Promise.all(
        screenshots.map((screenshot) => prepareScreenshot(screenshot.file)),
      );
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
          screenshots: preparedScreenshots,
        }),
      });
      const result = await response.json().catch(() => null) as { error?: string; traceId?: string } | null;
      if (!response.ok) throw new Error(result?.error || '回報失敗');
      setDescription('');
      screenshots.forEach((screenshot) => URL.revokeObjectURL(screenshot.previewUrl));
      setScreenshots([]);
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
            <div className="mt-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-zinc-700">問題截圖（選填，最多 3 張）</p>
                {screenshots.length < MAX_SCREENSHOTS && (
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-600">
                    <Camera size={14} />
                    選擇截圖
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="sr-only"
                      onChange={(event) => {
                        addScreenshots(event.target.files);
                        event.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
              {screenshots.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {screenshots.map((screenshot, index) => (
                    <div key={screenshot.previewUrl} className="relative aspect-square overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
                      <img src={screenshot.previewUrl} alt={`問題截圖 ${index + 1}`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeScreenshot(index)}
                        className="absolute right-1 top-1 rounded-full bg-black/70 p-1.5 text-white"
                        aria-label={`移除問題截圖 ${index + 1}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-amber-700">請先遮蔽電話、私人對話及其他個人資料。</p>
            </div>
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
