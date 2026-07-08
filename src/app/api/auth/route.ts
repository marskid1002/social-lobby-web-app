import { NextRequest, NextResponse } from 'next/server';
import {
  getAccount, createCustomer, verifyPassword, setInitialPassword,
  adminResetPassword, normalizeKey, normalizePhone,
} from '@/lib/auth-store';
import { signSession, sessionCookieHeader, clearSessionCookieHeader, getSessionFromRequest } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET：回傳目前 session 身份（供前端校正 currentUserId）
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: { id: session.userId, role: session.role, tier: session.tier } });
}

async function withSession(user: { id: string; role: 'user' | 'manager' | 'guest'; tier: string; nickname?: string }) {
  const token = await signSession({ userId: user.id, role: user.role, tier: user.tier });
  const res = NextResponse.json({ ok: true, user });
  res.headers.set('Set-Cookie', sessionCookieHeader(token));
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // 訪客：唯讀 session
    if (action === 'guest') {
      return withSession({ id: 'u-099', role: 'guest', tier: 'guest', nickname: '訪客' });
    }

    // 登出
    if (action === 'logout') {
      const res = NextResponse.json({ ok: true });
      res.headers.set('Set-Cookie', clearSessionCookieHeader());
      return res;
    }

    // 管理員重設幹部密碼（需 ADMIN_SECRET）
    if (action === 'admin-reset') {
      if (!process.env.ADMIN_SECRET || body.secret !== process.env.ADMIN_SECRET) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
      const ok = await adminResetPassword(body.account);
      return NextResponse.json({ ok });
    }

    // 客戶註冊：手機 + 暱稱 + 密碼
    if (action === 'register') {
      const phone = normalizePhone(body.phone ?? '');
      if (phone.length < 8) return NextResponse.json({ error: '請輸入有效手機號碼' }, { status: 400 });
      if (!body.password || String(body.password).length < 6) return NextResponse.json({ error: '密碼至少 6 碼' }, { status: 400 });
      if (await getAccount(phone)) return NextResponse.json({ error: '此手機已註冊，請直接登入' }, { status: 409 });
      const acc = await createCustomer(phone, body.password, body.nickname);
      return withSession({ id: acc.userId, role: 'user', tier: acc.tier, nickname: acc.nickname });
    }

    // 登入：帳號（手機 or A00x）+ 密碼
    if (action === 'login') {
      const key = normalizeKey(body.account ?? '');
      if (!key || !body.password) return NextResponse.json({ error: '請輸入帳號與密碼' }, { status: 400 });
      const acc = await getAccount(key);
      if (!acc) return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });

      // 幹部首次登入 → 以此次密碼設定並寫死
      if (acc.role === 'manager' && acc.hash === null) {
        if (String(body.password).length < 6) return NextResponse.json({ error: '首次登入請設定至少 6 碼密碼' }, { status: 400 });
        const activated = await setInitialPassword(key, body.password);
        if (!activated) return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });
        return withSession({ id: activated.userId, role: 'manager', tier: activated.tier, nickname: activated.nickname });
      }

      if (!verifyPassword(acc, body.password)) return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });
      return withSession({ id: acc.userId, role: acc.role, tier: acc.tier, nickname: acc.nickname });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[auth]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
