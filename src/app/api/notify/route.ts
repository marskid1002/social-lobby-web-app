import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { getSubscriptionsForUsers } from '@/lib/push-store';

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
    if (!ensureVapid()) {
      // 尚未設定 VAPID 金鑰（例如環境變數未填）→ 靜默略過，不影響主流程
      return NextResponse.json({ sent: 0, skipped: 'vapid not configured' });
    }

    const { title, body, url, userIds } = await req.json();
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 'no target users' });
    }
    const subscriptions = await getSubscriptionsForUsers(userIds);

    if (subscriptions.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const payload = JSON.stringify({ title, body, url: url ?? '/' });

    const results = await Promise.allSettled(
      subscriptions.map((sub) => webpush.sendNotification(sub, payload))
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    return NextResponse.json({ sent, total: subscriptions.length });
  } catch (e) {
    console.error('[notify]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
