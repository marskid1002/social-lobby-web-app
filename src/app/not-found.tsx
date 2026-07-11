import Link from 'next/link';

// 全站 404：亂打網址時的友善頁面
export default function NotFound() {
  return (
    <div className="min-h-screen bg-brand-snow flex flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl mb-3">🔍</div>
      <h1 className="text-lg font-bold text-brand-ink mb-1">找不到這個頁面</h1>
      <p className="text-sm text-zinc-400 mb-6">頁面可能已移除或網址有誤。</p>
      <Link
        href="/lobby/explore"
        className="px-6 py-3 rounded-xl bg-line-green text-white text-sm font-bold active:scale-[0.98] transition-transform"
      >
        回首頁
      </Link>
    </div>
  );
}
