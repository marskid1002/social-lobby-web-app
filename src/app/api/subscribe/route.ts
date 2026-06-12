import { NextRequest, NextResponse } from 'next/server';
import { saveSubscription } from '@/lib/push-store';

export async function POST(req: NextRequest) {
  try {
    const sub = await req.json();
    if (!sub?.endpoint) {
      return NextResponse.json({ error: 'invalid subscription' }, { status: 400 });
    }
    await saveSubscription(sub);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[subscribe]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
