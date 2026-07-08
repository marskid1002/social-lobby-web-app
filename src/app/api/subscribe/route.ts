import { NextRequest, NextResponse } from 'next/server';
import { saveSubscription } from '@/lib/push-store';
import { getSessionFromRequest } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const { subscription } = await req.json();
    if (!subscription?.endpoint) {
      return NextResponse.json({ error: 'invalid subscription' }, { status: 400 });
    }
    // 訂閱一律綁定到 session 身份，忽略前端傳來的 userId（防止攔截他人通知）
    await saveSubscription(session.userId, subscription);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[subscribe]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
