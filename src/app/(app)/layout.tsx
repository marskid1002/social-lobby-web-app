'use client';

import { useState, useEffect } from 'react';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';
import { ProfileDrawer } from '@/components/ProfileDrawer';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { Suspense } from 'react';

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
  const isUserProfile = pathname.startsWith('/u/');
  const isPlazaThread = /^\/plaza\/.+/.test(pathname);
  const isStore = pathname === '/store';

  return (
    <div className="flex flex-col min-h-screen bg-brand-snow">
      <Suspense fallback={null}>
        <AsParamHandler />
      </Suspense>

      {!isUserProfile && !isStore && (
        <TopBar
          title={getTitle(pathname)}
          showSearch={pathname.startsWith('/lobby')}
          onSearchChange={setSearchQuery}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
      )}

      <main className={`flex-1 ${isPlazaThread || isStore ? '' : 'pb-24'}`}>
        {children}
      </main>

      {!isPlazaThread && !isStore && <BottomNav />}
      <ProfileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
