'use client';

import { useRouter } from 'next/navigation';

export default function LegalBackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push('/login');
      }}
      className="min-h-11 text-sm font-semibold text-brand-sky"
    >
      ← 返回上一頁
    </button>
  );
}
