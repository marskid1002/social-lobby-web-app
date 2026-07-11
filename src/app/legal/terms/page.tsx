import Link from 'next/link';

export const metadata = { title: '服務條款 · Social Lobby' };

// 服務條款頁（骨架）：實際條文內容由平台/法務提供後填入下方區塊
export default function TermsPage() {
  return (
    <div className="min-h-screen bg-brand-snow">
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-brand-lavender px-4 py-3">
        <Link href="/settings" className="text-sm text-brand-sky font-semibold">← 返回</Link>
        <h1 className="text-base font-bold text-brand-ink mt-1">服務條款</h1>
      </div>
      <div className="px-5 py-5 text-sm leading-relaxed text-brand-ink space-y-3">
        <p className="text-zinc-500">本平台限 18 歲以上使用。以下為服務條款重點，完整條文以最新公告版本為準。</p>
        <p>使用本服務即表示你同意遵守相關規範，不得從事違法、騷擾或侵害他人權益之行為。平台保留於違規時暫停或終止帳號之權利。</p>
        <p className="text-zinc-400 text-xs">※ 完整法律條文整備中；如有疑問請透過設定頁的聯絡方式與我們聯繫。</p>
      </div>
    </div>
  );
}
