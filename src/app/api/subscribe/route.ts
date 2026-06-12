import { NextRequest, NextResponse } from 'next/server';
import { saveSubscription } from '@/lib/push-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { userId, subscription } = await req.json();
    if (!userId || !subscription?.endpoint) {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
    }
    await saveSubscription(userId, subscription);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[subscribe]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
