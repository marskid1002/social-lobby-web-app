import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { getCollection, mergeShared } from '@/lib/sync-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    if (auth.isGuest || auth.session.role !== 'manager' || auth.account?.role !== 'manager') {
      return NextResponse.json({ error: '只有幹部可以新增人員' }, { status: 403 });
    }

    const body = await req.json().catch(() => null) as { nickname?: unknown } | null;
    const nickname = typeof body?.nickname === 'string' ? body.nickname.trim().slice(0, 20) : '';
    if (!nickname) return NextResponse.json({ error: '請輸入人員名稱' }, { status: 400 });

    const escort = {
      id: `esc-${crypto.randomUUID()}`,
      managerId: auth.session.userId,
      nickname,
      bio: '',
      defaultArea: '信義區',
      createdAt: new Date().toISOString(),
    };
    await mergeShared({ escorts: [escort] });
    const escorts = (await getCollection('escorts')).filter((item) => (
      item.managerId === auth.session.userId && item.removed !== true
    ));
    return NextResponse.json({ ok: true, escort, escorts }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[escort create]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: '新增失敗，請稍後再試' }, { status: 500 });
  }
}
