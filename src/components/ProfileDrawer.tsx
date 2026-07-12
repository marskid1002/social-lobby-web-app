'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, User, ClipboardList, ShieldOff, Settings, LogOut, MapPin, ChevronRight, Bell } from 'lucide-react';
import { useAppState, resetState } from '@/lib/state';
import { TAIPEI_AREAS } from '@/lib/mock';
import { useNotificationPermission } from './PushManager';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ProfileDrawer({ open, onClose }: Props) {
  const { currentUser, isOnline, setOnline, setArea } = useAppState();
  const router = useRouter();
  const { permission, request: requestNotif } = useNotificationPermission();

  async function handleEnableNotif() {
    const p = await requestNotif();
    if (p === 'granted') toast.success('已開啟通知 🔔');
    else if (p === 'denied') toast('通知被拒絕，請到瀏覽器設定開啟');
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
      <div className="fixed inset-0 z-50 flex" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

        {/* Drawer panel */}
        <div
          className="relative w-[85%] max-w-[360px] h-full bg-gradient-ice rounded-r-[32px] flex flex-col overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-card-a p-5 pt-10">
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
              <span className="text-xs text-zinc-500">{currentUser?.id}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: tierColor + '20', color: tierColor }}>
                {tierLabel}
              </span>
              <span className="text-xs text-zinc-500">{currentUser?.credits} 點</span>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {/* Status controls */}
            <div className="bg-white rounded-2xl p-4 shadow-card flex flex-col gap-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">上班狀態</p>

              {/* Area select */}
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-zinc-400 shrink-0" strokeWidth={1.75} />
                <select
                  value={currentUser?.defaultArea ?? '信義區'}
                  onChange={(e) => setArea(e.target.value)}
                  className="flex-1 rounded-xl border border-brand-lavender bg-brand-snow px-3 py-2.5 text-sm text-brand-ink focus:outline-none appearance-none"
                >
                  {TAIPEI_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              {/* Online toggle */}
              <button
                onClick={() => setOnline(!isOnline)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${
                  isOnline ? 'bg-status-available/10 border-2 border-status-available/30' : 'bg-brand-snow border-2 border-brand-lavender'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-status-available' : 'bg-zinc-300'}`} />
                  <span className={`text-sm font-semibold ${isOnline ? 'text-status-available' : 'text-zinc-400'}`}>
                    {isOnline ? '我已上線' : '我離線中'}
                  </span>
                </div>
                <div className={`w-11 h-6 rounded-full transition-colors ${isOnline ? 'bg-status-available' : 'bg-zinc-200'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-sm mt-0.5 transition-transform ${isOnline ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
                </div>
              </button>
            </div>

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
                      : permission === 'unsupported' ? '此瀏覽器不支援（iPhone 請用 Safari 加入主畫面）'
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

            {/* Nav links */}
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              {[
                { icon: User, label: '我的個人檔案', path: '/me' },
                { icon: ClipboardList, label: '我的需求', path: '/inbox' },
                { icon: ShieldOff, label: '封鎖名單', path: '/settings' },
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
