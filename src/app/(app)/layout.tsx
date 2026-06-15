'use client';

import { useState, useEffect } from 'react';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';
import { ProfileDrawer } from '@/components/ProfileDrawer';
import { DualIdentityBadge } from '@/components/DualIdentityBadge';
import { NotificationWatcher } from '@/components/NotificationWatcher';
import { PushManager } from '@/components/PushManager';
import { NotificationBanner } from '@/components/NotificationBanner';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { Suspense } from 'react';

// IDs managed by the demo talent manager (u-018)
const MANAGER_ROSTER_IDS = ['u-002', 'u-005', 'u-009', 'u-015'];
const MANAGER_ID = 'u-018';

const PAGE_TITLES: Record<string, string> = {
  '/requests': '需求',
  '/inbox': '收件匣',
  '/updates': '動態',
  '/me': '我的個人檔案',
  '/settings': '設定',
  '/plaza': '廣場',
};

function getTitle(pathname: string) {
  if (pathname.startsWith('/lobby')) return undefined;
  if (pathname.startsWith('/plaza')) return undefined;
  if (pathname.startsWith('/u/')) return undefined;
  if (pathname.startsWith('/requests/') && pathname !== '/requests') return '需求詳情';
  return PAGE_TITLES[pathname] ?? 'Social Lobby';
}

function AsParamHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { switchUser } = useAppState();

  useEffect(() => {
    const asParam = searchParams.get('as');
    if (asParam) {
      switchUser(asParam);
      router.replace(window.location.pathname);
    }
  }, [searchParams]);

  return null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, switchUser } = useAppState();
  const isUserProfile = pathname.startsWith('/u/');
  const isPlazaThread = /^\/plaza\/.+/.test(pathname);
  const isStore = pathname === '/store';
  const isChat = pathname.startsWith('/chat/'); // 聊天頁全螢幕，使用自己的 header

  const isActingAsRosterGirl =
    currentUser?.role === 'escort' && MANAGER_ROSTER_IDS.includes(currentUser.id);

  function handleReturnToManager() {
    switchUser(MANAGER_ID);
    router.push('/lobby/explore');
  }

  return (
    <div className="flex flex-col min-h-screen bg-brand-snow">
      <Suspense fallback={null}>
        <AsParamHandler />
      </Suspense>

      {!isUserProfile && !isStore && !isChat && (
        <TopBar
          title={getTitle(pathname)}
          showSearch={pathname.startsWith('/lobby')}
          onSearchChange={setSearchQuery}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
      )}

      {/* Acting-as banner: shown when manager has switched into a roster girl */}
      {isActingAsRosterGirl && (
        <div className="sticky top-[57px] z-30 flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200">
          <img
            src={currentUser?.avatarUrl}
            alt={currentUser?.nickname}
            className="w-5 h-5 rounded-full object-cover shrink-0"
          />
          <span className="text-xs font-semibold text-amber-700 flex-1 truncate">
            以 <span className="font-bold">{currentUser?.nickname}</span> 的身份操作中
          </span>
          <button
            onClick={handleReturnToManager}
            className="shrink-0 text-[11px] font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full active:bg-amber-200 transition-colors"
          >
            返回幹部視角
          </button>
        </div>
      )}

      {!isUserProfile && !isStore && !isPlazaThread && !isChat && <NotificationBanner />}

      <main className={`flex-1 ${isPlazaThread || isStore || isChat ? '' : 'pb-24'}`}>
        {children}
      </main>

      {!isPlazaThread && !isStore && !isChat && <BottomNav />}
      <ProfileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <DualIdentityBadge />
      <NotificationWatcher />
      <PushManager />
    </div>
  );
}
