import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { activeConfirmedGirlIds } from '@/lib/request-attendance';
import { getCollection, permanentlyDeleteEscort } from '@/lib/sync-store';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireActiveSession(req);
  if (!auth.ok) return auth.response;
  if (auth.isGuest || auth.session.role !== 'manager' || auth.account?.role !== 'manager') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;
  if (!id || id.length > 100) {
    return NextResponse.json({ error: 'invalid escort id' }, { status: 400 });
  }

  const [escorts, responses, invitations] = await Promise.all([
    getCollection('escorts'),
    getCollection('responses'),
    getCollection('invitations'),
  ]);
  const escort = escorts.find((item) => item.id === id);
  if (!escort) return NextResponse.json({ error: '人員資料不存在' }, { status: 404 });
  if (escort.managerId !== auth.session.userId) {
    return NextResponse.json({ error: '無權刪除其他帳號的人員' }, { status: 403 });
  }
  if (activeConfirmedGirlIds(responses, invitations).has(id)) {
    return NextResponse.json({ error: '這位人員目前有進行中的安排，暫時不能刪除' }, { status: 409 });
  }

  await permanentlyDeleteEscort(id);
  return NextResponse.json({ ok: true });
}
