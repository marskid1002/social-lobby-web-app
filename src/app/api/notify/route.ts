import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { getSubscriptionsForUsers, removeSubscriptionByEndpoint } from '@/lib/push-store';
import { requireActiveSession } from '@/lib/active-session';
import { rateLimit } from '@/lib/rate-limit';

const MAX_RECIPIENTS = 50;
const MAX_TITLE = 100;
const MAX_BODY = 300;

export const dynamic = 'force-dynamic';

let vapidReady = false;

// 延遲初始化：只有在實際送推播時才設定 VAPID，避免 build 階段金鑰為空而報錯
function ensureVapid(): boolean {
  if (vapidReady) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL ?? 'mailto:demo@sociallobby.app',
    publicKey,
    privateKey
  );
  vapidReady = true;
  return true;
}

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

    if (!ensureVapid()) {
      // 尚未設定 VAPID 金鑰（例如環境變數未填）→ 靜默略過，不影響主流程
      return NextResponse.json({ sent: 0, skipped: 'vapid not configured' });
    }

    const { title, body, url, userIds } = await req.json();
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 'no target users' });
    }
    // 收件人數上限，避免單次群發全站
    const targetIds = userIds.slice(0, MAX_RECIPIENTS).map((x) => String(x));
    // 標題/內文長度上限（降低濫發與注入風險）
    const safeTitle = String(title ?? '').slice(0, MAX_TITLE);
    const safeBody = String(body ?? '').slice(0, MAX_BODY);
    // 連結只允許站內相對路徑，擋外部釣魚連結
    const safeUrl = typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/';
    const subscriptions = await getSubscriptionsForUsers(targetIds);

    if (subscriptions.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const payload = JSON.stringify({ title: safeTitle, body: safeBody, url: safeUrl });

    const results = await Promise.allSettled(
      subscriptions.map((sub) => webpush.sendNotification(sub, payload))
    );

    // 清理失效訂閱：web-push 對已過期/取消的端點回傳 404 或 410
    const stale: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const code = (r.reason as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) stale.push(subscriptions[i].endpoint);
      }
    });
    if (stale.length) {
      await Promise.allSettled(stale.map((ep) => removeSubscriptionByEndpoint(ep)));
    }

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    return NextResponse.json({ sent, total: subscriptions.length, cleaned: stale.length });
  } catch (e) {
    console.error('[notify]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
