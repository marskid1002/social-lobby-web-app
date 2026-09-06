import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE, type SessionPayload } from '@/lib/session';
import {
  BYPASS_COOKIE_NAME,
  BYPASS_COOKIE_VALUE,
  BYPASS_QUERY_PARAM,
  MAINTENANCE_HTML,
  isAlwaysAllowedPath,
  isMaintenanceMode,
  isValidBypassKey,
  safeEqual,
} from '@/lib/maintenance';

const APP_PAGES = ['/lobby', '/u/', '/me', '/requests', '/inbox', '/updates', '/settings', '/plaza', '/store', '/chat', '/onboarding'];
const PROTECTED_APIS = ['/api/sync', '/api/notify', '/api/subscribe', '/api/upload', '/api/report'];

function homeFor(session: SessionPayload): string {
  if (session.role === 'admin') return '/admin';
  if (session.role === 'account_admin' || session.role === 'account_viewer') return '/account-admin';
  if (session.role === 'manager' && session.mustChangeNickname) return '/complete-profile';
  return '/lobby/explore';
}

function redirectTo(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.redirect(url);
}

/**
 * 維護模式攔截。
 *
 * 刻意放在 proxy 最前面、且在 verifySession 之前：
 * 維護期間不需要 session，越早回應越好，也不會因為資料層／session 壞掉而失效。
 * 回傳 null 代表「不需攔截，繼續走正常授權流程」。
 */
function maintenanceGate(req: NextRequest): NextResponse | null {
  if (!isMaintenanceMode()) return null;

  const { pathname, searchParams } = req.nextUrl;

  // 健康檢查 / 版本探測：維護期間仍需保持可用
  if (isAlwaysAllowedPath(pathname)) return null;

  // 已持有 bypass cookie 的人（你自己）照常瀏覽
  const bypass = req.cookies.get(BYPASS_COOKIE_NAME)?.value;
  if (bypass && safeEqual(bypass, BYPASS_COOKIE_VALUE)) return null;

  // 帶正確金鑰 → 發 cookie 後導回乾淨網址（避免金鑰留在網址與瀏覽紀錄裡）
  if (searchParams.has(BYPASS_QUERY_PARAM)) {
    if (isValidBypassKey(searchParams.get(BYPASS_QUERY_PARAM))) {
      const clean = req.nextUrl.clone();
      clean.searchParams.delete(BYPASS_QUERY_PARAM);
      const response = NextResponse.redirect(clean);
      response.cookies.set(BYPASS_COOKIE_NAME, BYPASS_COOKIE_VALUE, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 12, // 12 小時後自動失效，避免忘記關掉
      });
      return response;
    }
    // 金鑰錯誤：不提示原因，直接落到下面的維護回應
  }

  // API 一律回 JSON，避免前端 fetch 收到 HTML 而炸出難解的解析錯誤
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'maintenance', message: '系統維護中，請稍後再試' },
      { status: 503, headers: { 'Retry-After': '3600', 'Cache-Control': 'no-store' } },
    );
  }

  // 頁面回 503 + 施工畫面。503 表示暫時性狀態，不會影響搜尋引擎既有排名。
  return new NextResponse(MAINTENANCE_HTML, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Retry-After': '3600',
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}

export async function proxy(req: NextRequest) {
  const maintenance = maintenanceGate(req);
  if (maintenance) return maintenance;

  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin')) {
    if (!session || session.role !== 'admin') {
      return pathname.startsWith('/api/')
        ? NextResponse.json({ error: 'forbidden' }, { status: 403 })
        : redirectTo(req, '/login');
    }
    return NextResponse.next();
  }

  if (pathname === '/account-admin' || pathname.startsWith('/account-admin/') || pathname.startsWith('/api/account-admin')) {
    if (!session || !['account_admin', 'account_viewer'].includes(session.role)) {
      return pathname.startsWith('/api/')
        ? NextResponse.json({ error: 'forbidden' }, { status: 403 })
        : redirectTo(req, '/login');
    }
    return NextResponse.next();
  }

  if (session?.role === 'account_viewer' && pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (pathname === '/complete-profile' || pathname.startsWith('/api/account')) {
    if (!session || session.role !== 'manager') {
      return pathname.startsWith('/api/')
        ? NextResponse.json({ error: 'forbidden' }, { status: 403 })
        : redirectTo(req, '/login');
    }
    if (pathname === '/complete-profile' && !session.mustChangeNickname) return redirectTo(req, '/lobby/explore');
    return NextResponse.next();
  }

  if (PROTECTED_APIS.some((prefix) => pathname.startsWith(prefix))) {
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (session.role === 'account_admin' || session.role === 'account_viewer') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (session.role === 'manager' && session.mustChangeNickname) {
      return NextResponse.json({ error: 'profile completion required' }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (APP_PAGES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) {
    if (!session) return redirectTo(req, '/login');
    if (session.role === 'account_admin' || session.role === 'account_viewer' || (session.role === 'manager' && session.mustChangeNickname)) {
      return redirectTo(req, homeFor(session));
    }
  }

  if (pathname === '/login' && session) return redirectTo(req, homeFor(session));
  if (pathname === '/') return redirectTo(req, session ? homeFor(session) : '/login');
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|api/auth|api/health).*)'],
};
