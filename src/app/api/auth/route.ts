import { NextRequest, NextResponse } from 'next/server';
import { getAccount, createAccount, verifyPassword, normalizePhone } from '@/lib/auth-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { action, phone, password, nickname } = await req.json();
    const key = normalizePhone(phone ?? '');

    if (!key || key.length < 8) {
      return NextResponse.json({ error: '請輸入有效手機號碼' }, { status: 400 });
    }
    if (!password || String(password).length < 4) {
      return NextResponse.json({ error: '密碼至少 4 碼' }, { status: 400 });
    }

    if (action === 'register') {
      const existing = await getAccount(key);
      if (existing) {
        return NextResponse.json({ error: '此手機已註冊，請直接登入' }, { status: 409 });
      }
      const account = await createAccount(key, password, nickname);
      return NextResponse.json({
        ok: true,
        user: { id: account.userId, nickname: account.nickname },
      });
    }

    if (action === 'login') {
      const account = await getAccount(key);
      if (!account || !verifyPassword(account, password)) {
        return NextResponse.json({ error: '手機或密碼錯誤' }, { status: 401 });
      }
      return NextResponse.json({
        ok: true,
        user: { id: account.userId, nickname: account.nickname },
      });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[auth]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
