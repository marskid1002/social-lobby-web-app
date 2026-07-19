'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, ShoppingBag } from 'lucide-react';

// demo 階段：付費/點數功能先隱藏，商城改為「即將推出」佔位頁（不露出定價與方案）。
export default function StorePage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-brand-snow flex flex-col">
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-brand-lavender px-4 py-3 flex items-center gap-2">
        <button
          onClick={() => router.back()}
          aria-label="返回"
          className="w-8 h-8 flex items-center justify-center rounded-full active:bg-brand-snow"
        >
          <ArrowLeft className="w-5 h-5 text-brand-ink" strokeWidth={1.75} />
        </button>
        <h1 className="text-base font-bold text-brand-ink">商城</h1>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-3">
        <div className="w-16 h-16 rounded-full bg-brand-ice flex items-center justify-center">
          <ShoppingBag className="w-7 h-7 text-brand-sky" strokeWidth={1.75} />
        </div>
        <p className="text-lg font-bold text-brand-ink">即將推出</p>
        <p className="text-sm text-zinc-400 leading-relaxed">目前所有功能皆可免費使用，付費方案還在規劃中，敬請期待。</p>
      </div>
    </div>
  );
}
