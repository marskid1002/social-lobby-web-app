import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE, type SessionPayload } from '@/lib/session';

const APP_PAGES = ['/lobby', '/u/', '/me', '/requests', '/inbox', '/updates', '/settings', '/plaza', '/store', '/chat', '/onboarding'];
const PROTECTED_APIS = ['/api/sync', '/api/notify', '/api/subscribe', '/api/upload', '/api/report'];

function homeFor(session: SessionPayload): string {
  if (session.role === 'admin') return '/admin';
  if (session.role === 'account_admin') return '/account-admin';
  if (session.role === 'manager' && session.mustChangeNickname) return '/complete-profile';
  return '/lobby/explore';
}

function redirectTo(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.redirect(url);
}

export async function proxy(req: NextRequest) {
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
    if (!session || session.role !== 'account_admin') {
      return pathname.startsWith('/api/')
        ? NextResponse.json({ error: 'forbidden' }, { status: 403 })
        : redirectTo(req, '/login');
    }
    return NextResponse.next();
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
    if (session.role === 'account_admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (session.role === 'manager' && session.mustChangeNickname) {
      return NextResponse.json({ error: 'profile completion required' }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (APP_PAGES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) {
    if (!session) return redirectTo(req, '/login');
    if (session.role === 'account_admin' || (session.role === 'manager' && session.mustChangeNickname)) {
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
