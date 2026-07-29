import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // G：禁止 client 直接指定 userIds/title/body/url。
    // 合法推播由 /api/sync、/api/matches/accept、/api/chat/messages 在 server
    // 完成資料寫入與關係授權後自行決定收件人。
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    return NextResponse.json(
      { error: 'direct push targets are not allowed' },
      { status: 403 },
    );
  } catch (e) {
    console.error('[notify]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
