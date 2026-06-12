'use client';

import { Bell, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useNotificationPermission } from './PushManager';

/**
 * 首頁頂部提示條：當使用者尚未決定通知權限時顯示，點擊請求授權。
 * granted / denied / unsupported 或使用者關閉後即不顯示。
 */
export function NotificationBanner() {
  const { permission, request } = useNotificationPermission();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (permission !== 'default') return null; // 已決定（允許/拒絕）或不支援 → 不顯示

  async function handleEnable() {
    const p = await request();
    if (p === 'granted') toast.success('已開啟通知，新邀請會即時提醒你 🔔');
    else if (p === 'denied') toast('通知已被拒絕，可到瀏覽器設定重新開啟');
  }

  return (
    <div className="mx-4 mt-3 flex items-center gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-brand-sky/20 to-brand-pink/20 border border-brand-lavender">
      <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
        <Bell className="w-4.5 h-4.5 text-brand-sky" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-brand-ink leading-tight">開啟通知</p>
        <p className="text-xs text-zinc-500 leading-tight mt-0.5">收到新邀請、加入與配對時即時提醒</p>
      </div>
      <button
        onClick={handleEnable}
        className="shrink-0 text-xs font-bold text-white bg-brand-sky px-3.5 py-2 rounded-full active:scale-95 transition-transform"
      >
        開啟
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-zinc-400 active:text-zinc-600"
        aria-label="關閉提示"
      >
        <X size={16} />
      </button>
    </div>
  );
}
