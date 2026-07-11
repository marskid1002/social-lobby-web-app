import Link from 'next/link';

export const metadata = { title: '隱私權政策 · Social Lobby' };

// 隱私權政策頁（骨架）：實際內容由平台/法務提供後填入下方區塊
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-brand-snow">
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-brand-lavender px-4 py-3">
        <Link href="/settings" className="text-sm text-brand-sky font-semibold">← 返回</Link>
        <h1 className="text-base font-bold text-brand-ink mt-1">隱私權政策</h1>
      </div>
      <div className="px-5 py-5 text-sm leading-relaxed text-brand-ink space-y-3">
        <p className="text-zinc-500">我們重視你的個人資料保護。以下說明資料的蒐集、使用與保存方式，完整政策以最新公告版本為準。</p>
        <p>我們僅為提供服務所需蒐集必要資料（如手機號碼、暱稱），不會在未經同意下提供給第三方作行銷用途。你可要求查詢、更正或刪除個人資料。</p>
        <p className="text-zinc-400 text-xs">※ 完整隱私權政策整備中；如需行使個資權利，請透過設定頁的聯絡方式與我們聯繫。</p>
      </div>
    </div>
  );
}
