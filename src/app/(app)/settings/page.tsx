'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bell, Lock, Languages, FileText, Trash2, ChevronRight } from 'lucide-react';
import { useAppState, resetState } from '@/lib/state';
import { TAIPEI_AREAS } from '@/lib/mock';

export default function SettingsPage() {
  const { state, currentUser, unblockUser } = useAppState();
  const router = useRouter();
  const [notifs, setNotifs] = useState(state.notificationsEnabled ?? true);
  const [showNearby, setShowNearby] = useState(state.showOnNearby ?? true);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [toast, setToast] = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }

  function handleDelete() {
    resetState();
    router.push('/login');
  }

  const blockedUsers = state.userBlocks.map((id) => state.users.find((u) => u.id === id)).filter(Boolean);

  return (
    <div className="min-h-screen bg-brand-snow">
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-brand-lavender px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-full hover:bg-brand-ice" aria-label="返回">
          <ArrowLeft className="w-5 h-5 text-brand-ink" strokeWidth={1.75} />
        </button>
        <h1 className="text-base font-semibold text-brand-ink">設定</h1>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4 pb-20">
        {/* 帳號 */}
        <section>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">帳號</p>
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            {[
              { label: '使用者 ID', value: currentUser?.id },
              { label: 'LINE 帳號', value: '已連結 @lineuser' },
            ].map((row, i) => (
              <div key={row.label} className={`flex items-center justify-between px-4 py-3.5 ${i > 0 ? 'border-t border-brand-lavender' : ''}`}>
                <span className="text-sm text-zinc-500">{row.label}</span>
                <span className="text-sm font-medium text-brand-ink">{row.value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3.5 border-t border-brand-lavender">
              <span className="text-sm text-zinc-500">會員等級</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-brand-ink capitalize">{currentUser?.tier} · {currentUser?.credits} 點</span>
                <button onClick={() => setUpgradeOpen(true)} className="text-xs font-semibold text-brand-sky px-2 py-0.5 rounded-full bg-brand-sky/10">升級</button>
              </div>
            </div>
          </div>
        </section>

        {/* 通知 */}
        <section>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">通知</p>
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex-1 min-w-0 mr-4">
                <p className="text-sm font-medium text-brand-ink">LINE 通知</p>
                <p className="text-xs text-zinc-400">收到邀請、回應、需求媒合時 LINE 推播</p>
              </div>
              <button
                onClick={() => setNotifs(!notifs)}
                className={`w-11 h-6 rounded-full transition-colors shrink-0 ${notifs ? 'bg-status-available' : 'bg-zinc-200'}`}
                aria-label="LINE 通知開關"
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow-sm mt-0.5 transition-transform ${notifs ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {!currentUser?.lineOAFollowed && (
              <div className="flex items-center justify-between px-4 py-3.5 border-t border-brand-lavender">
                <p className="text-sm text-brand-ink">加入官方 LINE 帳號</p>
                <button onClick={() => showToast('假裝你已加入官方 LINE！')} className="text-xs font-semibold text-line-green px-3 py-1.5 rounded-full border border-line-green">
                  + 加入
                </button>
              </div>
            )}
          </div>
        </section>

        {/* 隱私 */}
        <section>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">隱私</p>
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <button onClick={() => setBlockedOpen(true)} className="w-full flex items-center justify-between px-4 py-3.5">
              <span className="text-sm text-brand-ink">封鎖名單 ({blockedUsers.length})</span>
              <ChevronRight className="w-4 h-4 text-zinc-300" strokeWidth={1.75} />
            </button>
            <div className="flex items-center justify-between px-4 py-3.5 border-t border-brand-lavender">
              <span className="text-sm text-brand-ink">自動下線時間：4 小時</span>
              <ChevronRight className="w-4 h-4 text-zinc-300" strokeWidth={1.75} />
            </div>
            <div className="flex items-center justify-between px-4 py-3.5 border-t border-brand-lavender">
              <p className="text-sm text-brand-ink">允許在「附近」顯示我</p>
              <button
                onClick={() => setShowNearby(!showNearby)}
                className={`w-11 h-6 rounded-full transition-colors ${showNearby ? 'bg-status-available' : 'bg-zinc-200'}`}
                aria-label="附近顯示開關"
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow-sm mt-0.5 transition-transform ${showNearby ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        </section>

        {/* 語言 */}
        <section>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">語言</p>
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5">
              <span className="text-sm text-brand-ink">語言</span>
              <select className="text-sm text-brand-ink bg-transparent border-none focus:outline-none" defaultValue="zh-Hant">
                <option value="zh-Hant">繁體中文</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </section>

        {/* 關於 */}
        <section>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">關於</p>
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            {['服務條款', '隱私權政策', '檢舉問題'].map((item, i) => (
              <button key={item} onClick={() => showToast('假連結')} className={`w-full flex items-center justify-between px-4 py-3.5 ${i > 0 ? 'border-t border-brand-lavender' : ''}`}>
                <span className="text-sm text-brand-ink">{item}</span>
                <ChevronRight className="w-4 h-4 text-zinc-300" strokeWidth={1.75} />
              </button>
            ))}
          </div>
        </section>

        {/* Delete */}
        <button
          onClick={() => setDeleteOpen(true)}
          className="w-full py-3.5 rounded-2xl border-2 border-red-200 text-red-500 font-semibold text-sm bg-white active:bg-red-50 transition-colors"
        >
          刪除我的帳號
        </button>
      </div>

      {/* Blocked dialog */}
      {blockedOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setBlockedOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-brand-ink mb-4">封鎖名單</h3>
            {blockedUsers.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-4">沒有封鎖任何人</p>
            ) : (
              <div className="flex flex-col gap-2">
                {blockedUsers.map((u: any) => (
                  <div key={u.id} className="flex items-center gap-3">
                    <img src={u.avatarUrl} alt={u.nickname} className="w-9 h-9 rounded-full object-cover" />
                    <span className="flex-1 text-sm font-medium text-brand-ink">{u.nickname}</span>
                    <button onClick={() => { unblockUser(u.id); showToast('已解除封鎖'); }} className="text-xs text-brand-sky font-semibold px-3 py-1.5 rounded-full bg-brand-sky/10">
                      解除
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setBlockedOpen(false)} className="w-full mt-4 py-3 rounded-2xl bg-brand-snow text-zinc-500 font-semibold text-sm">
              關閉
            </button>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setDeleteOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-brand-ink mb-2">確定要刪除帳號？</h3>
            <p className="text-sm text-zinc-400 mb-5">此操作無法復原，所有資料將永久刪除。</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteOpen(false)} className="flex-1 py-3 rounded-2xl bg-brand-snow text-zinc-500 font-semibold text-sm">取消</button>
              <button onClick={handleDelete} className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-semibold text-sm">刪除</button>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade dialog */}
      {upgradeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setUpgradeOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-sky-pink flex items-center justify-center mx-auto mb-3 shadow-fab">
                <span className="text-3xl">👑</span>
              </div>
              <h3 className="text-lg font-semibold text-brand-ink">升級到 VIP</h3>
              <p className="text-sm text-zinc-400 mt-1">解鎖所有功能，無限發布需求</p>
            </div>
            <button onClick={() => { setUpgradeOpen(false); showToast('即將推出！'); }} className="w-full py-3.5 rounded-2xl bg-gradient-sky-pink text-brand-ink font-semibold text-sm shadow-fab">
              了解更多
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-brand-ink text-white text-sm rounded-full px-5 py-2.5 shadow-lg z-[100]">
          {toast}
        </div>
      )}
    </div>
  );
}
