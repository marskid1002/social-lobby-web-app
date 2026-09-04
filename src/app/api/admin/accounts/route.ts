import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { loadAdminAccountDirectory } from '@/lib/admin-account-directory';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireActiveSession(req);
  if (!auth.ok) return auth.response;
  if (
    auth.isGuest
    || auth.session.role !== 'admin'
    || auth.account?.role !== 'admin'
    || auth.account.key !== 'A000'
  ) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  const result = await loadAdminAccountDirectory({
    group: typeof body.group === 'string' ? body.group as 'manager' | 'user' | 'staff' : undefined,
    q: typeof body.q === 'string' ? body.q : '',
    page: typeof body.page === 'number' ? body.page : 1,
    pageSize: typeof body.pageSize === 'number' ? body.pageSize : 50,
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
