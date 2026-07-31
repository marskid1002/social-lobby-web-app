import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { getCollection, mergeShared } from '@/lib/sync-store';
import { planChatDecision, type ChatDecision } from '@/lib/chat-decision';
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

    const body = await req.json().catch(() => null) as {
      invitationId?: unknown;
      decision?: unknown;
    } | null;
    const invitationId = typeof body?.invitationId === 'string' ? body.invitationId : '';
    const decision = body?.decision as ChatDecision;
    const [invitations, responses, requests] = await Promise.all([
      getCollection('invitations'),
      getCollection('responses'),
      getCollection('requests'),
    ]);
    const result = planChatDecision({
      session: auth.session,
      invitationId,
      decision,
      invitations,
      responses,
      requests,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    if (!result.alreadyDecided) {
      await mergeShared({
        invitations: [result.invitation],
        ...(result.response ? { responses: [result.response] } : {}),
        ...(result.request ? { requests: [result.request] } : {}),
      });
      const traceId = result.requestId
        ? await getOrCreateTraceId(result.requestId)
        : `tr-${crypto.randomUUID()}`;
      await recordFlowTrace({
        traceId,
        eventType: decision === 'confirmed'
          ? 'chat.confirmed'
          : decision === 'declined' ? 'chat.declined' : 'chat.ended',
        actorUserId: auth.session.userId,
        requestId: result.requestId || undefined,
        threadId: result.threadId || undefined,
        entityId: result.invitation.id,
        dedupeKey: `chat.decision:${result.invitation.id}:${decision}`,
      }).catch((error) => {
        console.error('[chat decision trace]', error instanceof Error ? error.name : 'UnknownError');
      });

      if (result.customerUserId) {
        await sendWebPushToUsers(
          [result.customerUserId],
          decision === 'confirmed' ? '約會成功' : decision === 'declined' ? '約會失敗' : '約會結束',
          decision === 'confirmed'
            ? '幹部已確認這位小姐上台。'
            : decision === 'declined' ? '幹部已將本次約會標記為失敗。' : '本次約會已結束。',
          `/chat/${encodeURIComponent(result.threadId)}?req=${encodeURIComponent(result.requestId)}`,
        ).catch((error) => {
          console.error('[chat decision push]', error instanceof Error ? error.name : 'UnknownError');
        });
      }
    }

    return NextResponse.json({
      ok: true,
      invitation: result.invitation,
      response: result.response,
      request: result.request,
      alreadyDecided: result.alreadyDecided,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[chat decision]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
