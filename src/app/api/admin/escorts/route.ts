import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { loadAdminEscortDirectory } from '@/lib/admin-escort-directory';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
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
  const result = await loadAdminEscortDirectory({
    searchParams: new URL(req.url).searchParams,
    includeAvatars: true,
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
