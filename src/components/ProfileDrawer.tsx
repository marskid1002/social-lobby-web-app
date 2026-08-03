'use client';

import { useRouter } from 'next/navigation';
import { X, User, ClipboardList, ShieldOff, ShieldCheck, FileText, Settings, LogOut, ChevronRight, Bell } from 'lucide-react';
import { useAppState, resetState } from '@/lib/state';
import { useNotificationPermission } from './PushManager';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ProfileDrawer({ open, onClose }: Props) {
  const { currentUser } = useAppState();
  const router = useRouter();
  const { permission, request: requestNotif } = useNotificationPermission();

  async function handleEnableNotif() {
    const { permission: p, subscribed } = await requestNotif();
    if (p === 'granted' && subscribed) toast.success('已開啟通知，有新邀請會馬上通知你 🔔');
    else if (p === 'granted' && !subscribed) toast('通知已授權，但綁定失敗，請確認網路後再試一次');
    else if (p === 'denied') toast('通知被拒絕了，可以到瀏覽器或系統設定重新打開');
    else if (p === 'unsupported') toast('此瀏覽器不支援推播');
  }

  function handleLogout() {
    resetState(); // 清本機狀態
    // 導到 /logout 由伺服器清除 session cookie 再回登入頁（用整頁導向確保 Set-Cookie 生效）
    window.location.href = '/logout';
  }

  function navigate(path: string) {
    onClose();
    router.push(path);
  }

  const tierLabel = currentUser?.tier === 'vip' ? 'VIP' : currentUser?.tier === 'premium' ? '進階' : currentUser?.tier === 'standard' ? '標準' : 'Free';
  const tierColor = currentUser?.tier === 'vip' ? '#F59E0B' : currentUser?.tier === 'premium' ? '#7C3AED' : currentUser?.tier === 'standard' ? '#3B82F6' : '#6B7280';

  if (!open) return null;

  return (
    <>
      <div className="app-modal-layer fixed inset-0 flex" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

        {/* Drawer panel */}
        <div
          className="relative w-[85%] max-w-[360px] h-full bg-gradient-ice rounded-r-[32px] flex flex-col overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-card-a p-5 pt-[max(2.5rem,calc(1rem+env(safe-area-inset-top)))]">
            <div className="flex items-start justify-between mb-3">
              <button
                onClick={() => navigate('/me')}
                className="active:scale-95 transition-transform"
                aria-label="我的個人檔案"
              >
                <img
                  src={currentUser?.avatarUrl}
                  alt={currentUser?.nickname}
                  className="w-14 h-14 rounded-full object-cover ring-4 ring-white shadow-card"
                />
              </button>
              <button onClick={onClose} className="p-1.5 rounded-full bg-white/60" aria-label="關閉">
                <X className="w-4 h-4 text-brand-ink" strokeWidth={1.75} />
              </button>
            </div>
            <p className="text-lg font-semibold text-brand-ink">{currentUser?.nickname}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {/* 客戶 id 為 c-<uuid> 內部隨機碼、又長又不該給人看 → 只對短碼(u-0xx 幹部/管理員)顯示 */}
              {currentUser?.id && !currentUser.id.startsWith('c-') && (
                <span className="text-xs text-zinc-500">{currentUser.id}</span>
              )}
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: tierColor + '20', color: tierColor }}>
                {tierLabel}
              </span>
              {/* 點數顯示暫時隱藏（收費功能尚未開放）*/}
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {/* 通知開關 */}
            <div className="bg-white rounded-2xl p-4 shadow-card">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-sky/15 flex items-center justify-center shrink-0">
                  <Bell className="w-4.5 h-4.5 text-brand-sky" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-brand-ink">推播通知</p>
                  <p className="text-xs text-zinc-400">
                    {permission === 'granted' ? '已開啟，新邀請會提醒你'
                      : permission === 'denied' ? '已被拒絕，請到瀏覽器設定開啟'
                      : permission === 'unsupported' ? '此瀏覽器不支援推播（iPhone 請用 Safari 加到主畫面後開啟；Android 請用 Chrome）'
                      : '開啟後，關掉網頁也能收到新邀請'}
                  </p>
                </div>
                {permission === 'granted' ? (
                  <button
                    onClick={handleEnableNotif}
                    className="shrink-0 text-xs font-bold text-status-available border border-status-available/40 px-3 py-2 rounded-full active:scale-95 transition-transform"
                  >
                    已開啟·重新綁定
                  </button>
                ) : permission === 'default' ? (
                  <button
                    onClick={handleEnableNotif}
                    className="shrink-0 text-xs font-bold text-white bg-brand-sky px-3.5 py-2 rounded-full active:scale-95 transition-transform"
                  >
                    開啟
                  </button>
                ) : null}
              </div>
            </div>

            {/* Nav links（訪客為唯讀，不顯示個人功能選單）*/}
            {currentUser?.tier !== 'guest' && (
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              {[
                ...(currentUser?.role === 'admin'
                  ? [{ icon: ShieldCheck, label: '返回管理後台', path: '/admin' }]
                  : []),
                { icon: User, label: '我的個人檔案', path: '/me' },
                { icon: ClipboardList, label: '我的需求', path: '/inbox' },
                { icon: ShieldOff, label: '封鎖名單', path: '/blocked' },
                { icon: FileText, label: '平台規範', path: '/legal/terms' },
                { icon: Settings, label: '設定', path: '/settings' },
              ].map((item, i) => (
                <button
                  key={item.path + item.label}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-brand-ice transition-colors ${i > 0 ? 'border-t border-brand-lavender' : ''}`}
                >
                  <item.icon className="w-4.5 h-4.5 text-zinc-400" strokeWidth={1.75} />
                  <span className="flex-1 text-sm font-medium text-brand-ink">{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-zinc-300" strokeWidth={1.75} />
                </button>
              ))}
            </div>
            )}

            {/* 帳號 */}
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4.5 h-4.5 text-red-400" strokeWidth={1.75} />
                <span className="text-sm font-medium text-red-500">登出</span>
              </button>
            </div>

            <p className="text-center text-xs text-zinc-300 pb-2">v0.1 · zh-Hant</p>
          </div>
        </div>
      </div>

    </>
  );
}
