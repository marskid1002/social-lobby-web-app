import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { getAllSubscriptions } from '@/lib/push-store';

webpush.setVapidDetails(
  process.env.VAPID_EMAIL ?? 'mailto:demo@sociallobby.app',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
  process.env.VAPID_PRIVATE_KEY ?? ''
);

export async function POST(req: NextRequest) {
  try {
    const { title, body, url } = await req.json();
    const subscriptions = await getAllSubscriptions();

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
