'use client';

import { useState, useEffect } from 'react';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';
import { ProfileDrawer } from '@/components/ProfileDrawer';
import { DualIdentityBadge } from '@/components/DualIdentityBadge';
import { NotificationWatcher } from '@/components/NotificationWatcher';
import { PushManager } from '@/components/PushManager';
import { NotificationBanner } from '@/components/NotificationBanner';
import { SyncErrorToast } from '@/components/SyncErrorToast';
import { VersionWatcher } from '@/components/VersionWatcher';
import { PullToRefresh } from '@/components/PullToRefresh';
import { IssueReporter } from '@/components/IssueReporter';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { Suspense } from 'react';

const PAGE_TITLES: Record<string, string> = {
  '/requests': '需求',
  '/inbox': '收件匣',
  '/updates': '動態',
  '/me': '我的個人檔案',
  '/blocked': '封鎖名單',
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

// 以 server session 校正前端身份：避免 localStorage 過期/預設造成畫面顯示錯的人
function SessionSync() {
  const { state, switchUser, loginCustomer } = useAppState();
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth') // GET 回傳目前 session 身份
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.user) return;
        const { id, role } = data.user;
        if (id === state.currentUserId) return; // 已一致
        if (role === 'user') loginCustomer(id, '用戶');
        else switchUser(id); // 幹部 / 訪客（在 seed 內）
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // 僅在掛載時校正一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function AsParamHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { switchUser } = useAppState();

  useEffect(() => {
    // ?as= 冒充僅限示範模式（正式環境停用）
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return;
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
  // Hydration 安全：SSR 與客戶端首次渲染都先顯示中性佔位（內容來自 localStorage/相對時間，
  // 兩邊本就不一致 → 用 mounted 閘門避免 React #418），掛載後才渲染真實內容。
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, state, returnToManager } = useAppState();
  const isUserProfile = pathname.startsWith('/u/');
  const isPlazaThread = /^\/plaza\/.+/.test(pathname);
  const isStore = pathname === '/store';
  const isChat = pathname.startsWith('/chat/'); // 聊天頁全螢幕，使用自己的 header

  // 幹部以旗下小姐身份操作中（有記錄原幹部）
  const isActingAsRosterGirl = !!state.actingFromManagerId && currentUser?.role === 'escort';

  function handleReturnToManager() {
    returnToManager();
    router.push('/lobby/explore');
  }

  // 掛載前顯示中性佔位（SSR 與 client 首次渲染一致，避免 hydration 不匹配）
  if (!mounted) {
    return <div className="mx-auto max-w-[430px] min-h-screen bg-brand-snow" />;
  }

  const isRequestDetail = /^\/requests\/[^/]+$/.test(pathname) && pathname !== '/requests/new';
  const showBottomNav = !isPlazaThread && !isStore && !isChat && !isRequestDetail;

  return (
    <div className="flex flex-col min-h-screen bg-brand-snow">
      <SessionSync />
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
      {currentUser?.role === 'admin' && (isUserProfile || isStore || isChat) && (
        <button
          type="button"
          onClick={() => router.push('/admin')}
          className="fixed right-[max(12px,calc(50%-203px))] top-3 z-[80] rounded-full bg-zinc-900 px-3 py-2 text-[11px] font-bold text-white shadow-lg"
          aria-label="返回管理後台"
        >
          返回後台
        </button>
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

      <main className={`flex-1 ${showBottomNav ? 'app-bottom-clearance' : ''}`}>
        {children}
      </main>

      {showBottomNav && <BottomNav />}
      <ProfileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <DualIdentityBadge />
      <NotificationWatcher />
      <PushManager />
      <SyncErrorToast />
      <VersionWatcher />
      <PullToRefresh />
      <Suspense fallback={null}>
        <IssueReporter />
      </Suspense>
    </div>
  );
}
