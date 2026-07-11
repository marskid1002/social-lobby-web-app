import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

// 需要登入的頁面前綴
const PROTECTED_PAGES = ['/lobby', '/u/', '/me', '/requests', '/inbox', '/updates', '/settings', '/plaza', '/store', '/chat', '/onboarding'];
// 需要登入的 API（/api/auth、/api/health 除外）
const PROTECTED_APIS = ['/api/sync', '/api/notify', '/api/subscribe', '/api/upload', '/api/report'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  // 管理後台（頁面 + API）：僅限 admin 角色
  if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin')) {
    if (!session || session.role !== 'admin') {
      if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const isProtectedApi = PROTECTED_APIS.some((p) => pathname.startsWith(p));
  if (isProtectedApi) {
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    return NextResponse.next();
  }

  const isProtectedPage = PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(p));
  if (isProtectedPage && !session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 已登入者不需再看登入頁
  if (pathname === '/login' && session) {
    const url = req.nextUrl.clone();
    url.pathname = '/lobby/explore';
    return NextResponse.redirect(url);
  }

  // 根路徑：依登入狀態導向
  if (pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = session ? '/lobby/explore' : '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // 排除靜態資源、_next、api/auth、api/health、圖示與 sw
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|api/auth|api/health).*)'],
};
