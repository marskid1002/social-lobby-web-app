import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { rateLimit } from '@/lib/rate-limit';
import { sendWebPushToUsers } from '@/lib/push-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // F：需登入且帳號仍有效（含登入後被停用/刪除者），在 rate limit 與任何推播之前擋下。
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    // 訪客唯讀，不可觸發推播（沿用既有行為）
    if (auth.isGuest) return NextResponse.json({ error: 'guest is read-only' }, { status: 403 });
    const session = auth.session;

    // 速率限制：每人每 5 分鐘最多 30 次，抵擋大量濫發/騷擾
    const rl = await rateLimit('notify', session.userId, 30, 5 * 60);
    if (!rl.ok) return NextResponse.json({ error: 'too many requests', retryAfter: rl.retryAfter }, { status: 429 });

    const { title, body, url, userIds } = await req.json();
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 'no target users' });
    }
    return NextResponse.json(await sendWebPushToUsers(
      userIds.map((value) => String(value)),
      String(title ?? ''),
      String(body ?? ''),
      typeof url === 'string' ? url : '/',
    ));
  } catch (e) {
    console.error('[notify]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
