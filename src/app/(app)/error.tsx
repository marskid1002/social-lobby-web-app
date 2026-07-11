'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// (app) 區段錯誤邊界：單頁 render 例外時顯示可復原畫面，而非整片白畫面
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error('[app error]', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
      <div className="text-4xl mb-3">😵</div>
      <h1 className="text-base font-bold text-brand-ink mb-1">這個頁面出了點問題</h1>
      <p className="text-sm text-zinc-400 mb-5">你可以重新整理，或回到首頁繼續。</p>
      <div className="flex gap-3">
        <button
          onClick={() => reset()}
          className="px-5 py-2.5 rounded-xl bg-line-green text-white text-sm font-bold active:scale-[0.98] transition-transform"
        >
          重新整理
        </button>
        <button
          onClick={() => router.push('/lobby/explore')}
          className="px-5 py-2.5 rounded-xl bg-white border border-brand-lavender text-brand-ink text-sm font-bold active:scale-[0.98] transition-transform"
        >
          回首頁
        </button>
      </div>
    </div>
  );
}
