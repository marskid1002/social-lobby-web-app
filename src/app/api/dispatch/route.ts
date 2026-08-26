import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { getCollection, mergeShared } from '@/lib/sync-store';
import { planEscortDispatch } from '@/lib/escort-dispatch';
import { deliverAuthorizedPushes, planAuthorizedSyncPushes } from '@/lib/push-authz';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    if (auth.isGuest || auth.session.role !== 'manager' || auth.account?.role !== 'manager') {
      return NextResponse.json({ error: '只有幹部可以安排出席' }, { status: 403 });
    }

    const body = await req.json().catch(() => null) as {
      requestId?: unknown;
      escortIds?: unknown;
    } | null;
    const requestId = typeof body?.requestId === 'string' ? body.requestId : '';
    const rawEscortIds = Array.isArray(body?.escortIds) ? body.escortIds : [];
    const escortIds = rawEscortIds
      .filter((id): id is string => typeof id === 'string' && id.length <= 100);
    if (!requestId || requestId.length > 100 || escortIds.length !== rawEscortIds.length) {
      return NextResponse.json({ error: '派工資料格式錯誤' }, { status: 400 });
    }

    const [requests, escorts, responses, invitations, presence] = await Promise.all([
      getCollection('requests'),
      getCollection('escorts'),
      getCollection('responses'),
      getCollection('invitations'),
      getCollection('presence'),
    ]);
    const result = planEscortDispatch({
      session: auth.session,
      requestId,
      escortIds,
      requests,
      escorts,
      responses,
      invitations,
      presence,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    const patch = { responses: result.responses, updates: result.updates };
    const pushJobs = planAuthorizedSyncPushes({
      patch,
      existing: { requests, escorts, responses, invitations },
      managerUserIds: [],
      session: auth.session,
    });
    await mergeShared(patch);
    await deliverAuthorizedPushes(pushJobs, auth.session);

    return NextResponse.json({ ok: true, ...patch }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[escort dispatch]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: '安排失敗，請稍後再試' }, { status: 500 });
  }
}
