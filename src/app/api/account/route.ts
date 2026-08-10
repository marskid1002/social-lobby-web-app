import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { updateOwnManagerNickname } from '@/lib/auth-store';
import { getCollection, mergeShared } from '@/lib/sync-store';
import { signSession, sessionCookieHeader } from '@/lib/session';

export const dynamic = 'force-dynamic';

async function requireManager(req: NextRequest) {
  const auth = await requireActiveSession(req);
  if (!auth.ok) return auth;
  if (auth.session.role !== 'manager' || auth.account?.role !== 'manager') {
    return { ok: false as const, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return auth;
}

export async function GET(req: NextRequest) {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const account = auth.account;
  if (!account) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({
    account: account.key,
    nickname: account.nickname,
    mustChangeNickname: account.mustChangeNickname === true,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null) as { nickname?: unknown } | null;
  const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : '';
  if (nickname.length < 2 || nickname.length > 60 || /^幹部\d+$/.test(nickname)) {
    return NextResponse.json({ error: '請輸入 2–60 字且非預設格式的名稱' }, { status: 400 });
  }

  const updated = await updateOwnManagerNickname(auth.session.userId, nickname);
  if (!updated) return NextResponse.json({ error: '更新失敗' }, { status: 400 });

  const profiles = await getCollection('registeredUsers');
  const existing = profiles.find((item) => item.id === updated.userId);
  await mergeShared({
    registeredUsers: [{
      ...(existing ?? {}),
      id: updated.userId,
      lineUserId: String(existing?.lineUserId ?? updated.userId),
      nickname: updated.nickname,
      avatarUrl: String(existing?.avatarUrl ?? ''),
      cardImageUrl: String(existing?.cardImageUrl ?? ''),
      bio: String(existing?.bio ?? ''),
      defaultArea: String(existing?.defaultArea ?? '台北市'),
      interests: Array.isArray(existing?.interests) ? existing.interests : [],
      tier: 'vip',
      role: 'manager',
      credits: Number(existing?.credits ?? 0),
      monthlyRequestsLeft: Number(existing?.monthlyRequestsLeft ?? 0),
      lineOAFollowed: Boolean(existing?.lineOAFollowed),
      createdAt: String(existing?.createdAt ?? updated.createdAt),
    }],
  });

  const token = await signSession({
    userId: updated.userId,
    role: 'manager',
    tier: updated.tier,
    sessionVersion: updated.sessionVersion ?? 0,
    mustChangeNickname: false,
  });
  const response = NextResponse.json({ ok: true, nickname: updated.nickname });
  response.headers.set('Set-Cookie', sessionCookieHeader(token));
  return response;
}
