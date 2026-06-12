import { NextRequest, NextResponse } from 'next/server';
import { getShared, mergeShared, clearShared } from '@/lib/sync-store';

// 避免快取，確保每次都拿到最新共享狀態
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const shared = await getShared();
    return NextResponse.json(shared, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[sync GET]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // 重設：{ reset: true } → 清空共享資料
    if (body?.reset) {
      await clearShared();
      return NextResponse.json({ ok: true, cleared: true });
    }
    // patch：{ requests?, responses?, invitations?, updates?, chatMessages? }
    const merged = await mergeShared(body?.patch ?? {});
    return NextResponse.json(merged);
  } catch (e) {
    console.error('[sync POST]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
