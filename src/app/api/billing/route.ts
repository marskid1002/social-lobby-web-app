import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import {
  createSubscriptionCheckout, handleBillingWebhook, getSubscription,
  isBillingEnabled, type SubscriptionPlan,
} from '@/lib/billing';

export const dynamic = 'force-dynamic';

// GET：查詢目前訂閱狀態
export async function GET(req: NextRequest) {
  const auth = await requireActiveSession(req);
  if (!auth.ok) return auth.response;
  if (auth.isGuest) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const sub = await getSubscription(auth.session.userId);
  return NextResponse.json({ billingEnabled: isBillingEnabled(), subscription: sub });
}

// POST：{ action:'checkout', plan } 建立訂閱結帳 ／ { action:'webhook' } 金流回調
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 金流 webhook（未來由金流服務呼叫，無瀏覽器 session）——絕不使用 session helper。
    // 此分支在最前面就 return，因此下方的 requireActiveSession 永遠不會作用在 webhook 上。
    if (body?.action === 'webhook') {
      const result = await handleBillingWebhook(body);
      return NextResponse.json(result);
    }

    // F：webhook 以外的操作（checkout）需登入且帳號仍有效（含登入後被停用/刪除者）；
    // 以可信任的 session.userId 建立 checkout。
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    // F follow-up：guest 皆共用 u-099、應維持唯讀，且無正式帳號，不得建立結帳（在 isBillingEnabled/建立 checkout 前擋下）。
    if (auth.isGuest) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const session = auth.session;

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
