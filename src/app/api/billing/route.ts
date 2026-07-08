import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import {
  createSubscriptionCheckout, handleBillingWebhook, getSubscription,
  isBillingEnabled, type SubscriptionPlan,
} from '@/lib/billing';

export const dynamic = 'force-dynamic';

// GET：查詢目前訂閱狀態
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sub = await getSubscription(session.userId);
  return NextResponse.json({ billingEnabled: isBillingEnabled(), subscription: sub });
}

// POST：{ action:'checkout', plan } 建立訂閱結帳 ／ { action:'webhook' } 金流回調
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 金流 webhook（未來由金流服務呼叫，無 session）
    if (body?.action === 'webhook') {
      const result = await handleBillingWebhook(body);
      return NextResponse.json(result);
    }

    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    if (body?.action === 'checkout') {
      if (!isBillingEnabled()) {
        return NextResponse.json({ error: '金流尚未開放', enabled: false }, { status: 503 });
      }
      const result = await createSubscriptionCheckout(session.userId, body.plan as SubscriptionPlan);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[billing]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
