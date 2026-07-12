import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookieHeader } from '@/lib/session';

export const dynamic = 'force-dynamic';

// 永久登出備援：直接開 /logout 即清除 session cookie 並導回登入頁。
// 不依賴任何 UI 按鈕，避免抽屜渲染問題導致無法登出。
export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  const res = NextResponse.redirect(url);
  res.headers.set('Set-Cookie', clearSessionCookieHeader());
  return res;
}
