import { NextRequest, NextResponse } from 'next/server';
import { saveSubscription } from '@/lib/push-store';
import { requireActiveSession } from '@/lib/active-session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // F：需登入且帳號仍有效（含登入後被停用/刪除者）才能儲存推播訂閱，在寫入 subscription 之前擋下。
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    // F follow-up：guest 皆共用 u-099、應維持唯讀，且無正式帳號，不得儲存 push 訂閱（在 req.json 之前擋下）。
    if (auth.isGuest) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const session = auth.session;

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
