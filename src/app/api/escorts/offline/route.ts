import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { getCollection, mergeShared } from '@/lib/sync-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    if (auth.isGuest || auth.session.role !== 'manager' || auth.account?.role !== 'manager') {
      return NextResponse.json({ error: '只有幹部可以操作所屬人員下班' }, { status: 403 });
    }
    const body = await req.json().catch(() => null);
    if (body?.confirm !== 'all-owned') {
      return NextResponse.json({ error: '請先確認全部下班' }, { status: 400 });
    }
    const [escorts, presence] = await Promise.all([getCollection('escorts'), getCollection('presence')]);
    // Ownership is always derived from the active session and server records.
    const ownedIds = new Set(escorts.filter(e => e.managerId === auth.session.userId && !e.removed).map(e => e.id));
    const updatedAt = new Date().toISOString();
    const offline = presence.filter(p => ownedIds.has(p.id) && p.online === true)
      .map(p => ({ ...p, online: false, updatedAt }));
    // One HSET for the presence collection; invitations, responses and chats are untouched.
    if (offline.length) await mergeShared({ presence: offline });
    return NextResponse.json({ ok: true, count: offline.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[roster offline]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: '下班操作未確認完成，請重新整理後確認狀態再重試' }, { status: 500 });
  }
}
