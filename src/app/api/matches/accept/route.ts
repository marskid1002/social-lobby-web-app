import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { getCollection, mergeShared } from '@/lib/sync-store';
import { planAcceptMatch } from '@/lib/match-accept';
import { sendWebPushToUsers } from '@/lib/push-service';
import { getOrCreateTraceId, recordFlowTrace } from '@/lib/flow-trace-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    if (auth.isGuest) {
      return NextResponse.json({ error: 'guest is read-only' }, { status: 403 });
    }

    const body = await req.json().catch(() => null) as { responseId?: unknown } | null;
    if (typeof body?.responseId !== 'string') {
      return NextResponse.json({ error: 'invalid responseId' }, { status: 400 });
    }

    const [requests, responses, invitations] = await Promise.all([
      getCollection('requests'),
      getCollection('responses'),
      getCollection('invitations'),
    ]);
    const result = planAcceptMatch({
      session: auth.session,
      responseId: body.responseId,
      requests,
      responses,
      invitations,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const patch = {
      responses: [result.response],
      invitations: [result.invitation],
      ...(result.update ? { updates: [result.update] } : {}),
    };
    await mergeShared(patch);
    const traceId = await getOrCreateTraceId(result.requestId);
    await Promise.all([
      recordFlowTrace({
        traceId,
        eventType: 'match.accepted',
        actorUserId: auth.session.userId,
        requestId: result.requestId,
        entityId: result.response.id,
        dedupeKey: `match.accepted:${result.response.id}`,
      }),
      recordFlowTrace({
        traceId,
        eventType: 'chat.created',
        actorUserId: auth.session.userId,
        requestId: result.requestId,
        threadId: typeof result.invitation.groupThreadId === 'string'
          ? result.invitation.groupThreadId
          : undefined,
        entityId: result.invitation.id,
        dedupeKey: `chat.created:${result.invitation.id}`,
      }),
    ]).catch((error) => {
      console.error('[flow trace accept]', error instanceof Error ? error.name : 'UnknownError');
    });

    // 只有 server 寫入完成後才發送「聊天室已開啟」通知，避免假成功。
    if (!result.alreadyAccepted) {
      const pushResult = await sendWebPushToUsers(
        [result.partnerUserId],
        '客戶已同意入局！',
        `${auth.account?.nickname ?? '某位客戶'} 已同意，聊天室已開啟`,
        `/inbox?match=${encodeURIComponent(String(result.invitation.id))}&src=push`,
      ).catch((error) => {
        console.error('[match accept push]', error instanceof Error ? error.name : 'UnknownError');
        return { sent: 0, total: 0, skipped: 'push error' };
      });
      await recordFlowTrace({
        traceId,
        eventType: 'chat.push',
        outcome: pushResult.sent > 0 ? 'success' : 'skipped',
        actorUserId: auth.session.userId,
        requestId: result.requestId,
        entityId: result.invitation.id,
        code: pushResult.skipped,
        detail: `sent=${pushResult.sent};total=${pushResult.total ?? 0}`,
        dedupeKey: `chat.push:${result.invitation.id}`,
      }).catch((error) => {
        console.error('[flow trace accept push]', error instanceof Error ? error.name : 'UnknownError');
      });
    }

    return NextResponse.json({
      ok: true,
      response: result.response,
      invitation: result.invitation,
      update: result.update,
      alreadyAccepted: result.alreadyAccepted,
      traceId,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[match accept]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
