import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { loadAdminEscortDirectory } from '@/lib/admin-escort-directory';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireActiveSession(req);
  if (!auth.ok) return auth.response;
  if (
    auth.isGuest
    || auth.session.role !== 'account_viewer'
    || auth.account?.role !== 'account_viewer'
    || auth.account.key !== 'A777'
  ) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const result = await loadAdminEscortDirectory({
    searchParams: new URL(req.url).searchParams,
    privateNameViewerId: auth.session.userId,
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
