'use client';

import { useState } from 'react';
import { X, Minus, Plus } from 'lucide-react';
import { useAppState } from '@/lib/state';
import { TAIPEI_AREAS } from '@/lib/mock';
import type { RequestType } from '@/lib/mock';
import { useRouter } from 'next/navigation';

const REQUEST_TYPES: { value: RequestType; label: string; color: string }[] = [
  { value: 'after_party', label: 'After Party', color: '#F7BEF1' },
  { value: 'drinking', label: '喝一杯', color: '#F59E0B' },
  { value: 'fill_spot', label: '補位', color: '#8BD8F1' },
  { value: 'last_minute', label: '臨時局', color: '#EF4444' },
  { value: 'other', label: '其他', color: '#DED9E5' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PostRequestSheet({ open, onClose }: Props) {
  const { currentUser, postRequest } = useAppState();
  const router = useRouter();

  const maxCount = 20; // 發局免費、不分等級：可加入人數 1~20

  const [area, setArea] = useState(currentUser?.defaultArea ?? '信義區');
  const [type, setType] = useState<RequestType | null>(null);
  const [count, setCount] = useState(Math.min(1, maxCount));
  const [note, setNote] = useState('');
  const [toast, setToast] = useState(false);

  function handleSubmit() {
    if (!type) return;
    postRequest({ area, requestType: type, peopleCount: count, note });
    setToast(true);
    setTimeout(() => {
      setToast(false);
      onClose();
      setType(null);
      setNote('');
      setCount(Math.min(1, maxCount));
      router.push('/inbox');
    }, 1000);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[430px] bg-white rounded-t-[28px] p-5 pb-8 shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-brand-ink">發布邀請</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-brand-snow" aria-label="關閉">
            <X className="w-5 h-5 text-zinc-500" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex flex-col gap-5">
            {/* Area */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-brand-ink">區域</label>
              <select
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="w-full rounded-2xl border border-brand-lavender bg-white px-4 py-3 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-sky appearance-none"
              >
                {TAIPEI_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {/* Type */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-brand-ink">類型</label>
              <div className="flex flex-wrap gap-2">
                {REQUEST_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setType(t.value)}
                    className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-all active:scale-95 ${
                      type === t.value
                        ? 'border-transparent text-brand-ink'
                        : 'border-brand-lavender text-zinc-500 bg-white'
                    }`}
                    style={type === t.value ? { backgroundColor: t.color } : {}}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Count — capped by tier */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-brand-ink">可加入人數</label>
                <span className="text-xs text-zinc-400">最多 {maxCount} 人</span>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setCount((c) => Math.max(1, c - 1))}
                  className="w-10 h-10 rounded-full border-2 border-brand-lavender flex items-center justify-center active:bg-brand-ice transition-colors"
                  aria-label="減少人數"
                >
                  <Minus className="w-4 h-4 text-brand-ink" strokeWidth={2} />
                </button>
                <span className="text-2xl font-semibold text-brand-ink w-8 text-center">{count}</span>
                <button
                  onClick={() => setCount((c) => Math.min(maxCount, c + 1))}
                  className="w-10 h-10 rounded-full border-2 border-brand-lavender flex items-center justify-center active:bg-brand-ice transition-colors"
                  aria-label="增加人數"
                >
                  <Plus className="w-4 h-4 text-brand-ink" strokeWidth={2} />
                </button>
              </div>
            </div>

            {/* Note */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-brand-ink">備註</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                maxLength={200}
                placeholder="說明你想找的人或場合..."
                className="w-full rounded-2xl border border-brand-lavender bg-white px-4 py-3 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-sky resize-none"
              />
              <p className="text-xs text-zinc-400 text-right">{note.length}/200</p>
            </div>

            <p className="text-xs text-zinc-400 text-center">邀請有效時間：2 小時</p>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!type}
              className="w-full rounded-2xl bg-brand-sky text-brand-ink font-semibold text-base py-4 active:scale-[0.98] transition-all disabled:opacity-40 shadow-card"
            >
              發送邀請
            </button>
          </div>
      </div>

      {toast && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-brand-ink text-white text-sm rounded-full px-5 py-2.5 shadow-lg z-50">
          邀請已發送
        </div>
      )}
    </div>
  );
}
