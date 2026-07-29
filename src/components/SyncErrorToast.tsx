'use client';

import { useEffect, useState } from 'react';
import { onSyncError } from '@/lib/state';

// 全站同步失敗提示：訂閱 onSyncError，讓「看似成功、其實沒同步到伺服器」的操作不再靜默。
// 之前只有幹部後台(OperatorHome)會顯示；改成全域後，客戶/訪客端的寫入失敗也會被看見。
export function SyncErrorToast() {
  const [msg, setMsg] = useState('');

  useEffect(() => {
    return onSyncError((raw) => {
      try {
        window.sessionStorage.setItem('sl:last-sync-error', String(raw).slice(0, 160));
      } catch {}
      // 訪客/唯讀被拒 → 給友善說明；其餘保留診斷字串（含狀態碼/集合名）方便回報
      const friendly = /guest is read-only|唯讀|read-only/i.test(raw)
        ? '訪客無法儲存資料，請先登入或註冊才能進行此操作'
        : `操作沒有同步成功：${raw}`;
      setMsg(friendly);
      // 用 setTimeout 於下一輪清除；長訊息停久一點方便閱讀/回報
      window.clearTimeout((SyncErrorToast as unknown as { _t?: number })._t);
      (SyncErrorToast as unknown as { _t?: number })._t = window.setTimeout(() => setMsg(''), 8000);
    });
  }, []);

  if (!msg) return null;

  return (
    <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[60] max-w-[90vw] rounded-2xl bg-red-600 text-white text-sm font-semibold px-5 py-3 shadow-lg text-center break-words">
      ⚠️ {msg}
    </div>
  );
}
