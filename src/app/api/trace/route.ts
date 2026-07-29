import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { getCollection } from '@/lib/sync-store';
import { buildChatAccessIndex, canReadChatThread } from '@/lib/chat-authz';
import { getOrCreateTraceId, recordFlowTrace } from '@/lib/flow-trace-store';

export const dynamic = 'force-dynamic';

const allowedEvents = new Set(['notification.opened', 'chat.entered']);
const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    if (auth.isGuest) {
      return NextResponse.json({ error: 'guest is read-only' }, { status: 403 });
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const eventType = text(body?.eventType, 80);
    const requestId = text(body?.requestId, 128);
    const threadId = text(body?.threadId, 256);
    if (!allowedEvents.has(eventType) || !requestId || !threadId) {
      return NextResponse.json({ error: 'invalid trace event' }, { status: 400 });
    }

    const [requests, responses, invitations] = await Promise.all([
      getCollection('requests'),
      getCollection('responses'),
      getCollection('invitations'),
    ]);
    const access = buildChatAccessIndex(auth.session.userId, {
      requests,
      responses,
      invitations,
    });
    if (!canReadChatThread(threadId, access)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const traceId = await getOrCreateTraceId(requestId);
    await recordFlowTrace({
      traceId,
      eventType,
      actorUserId: auth.session.userId,
      requestId,
      threadId,
      dedupeKey: `${eventType}:${traceId}:${auth.session.userId}`,
    });
    return NextResponse.json(
      { ok: true, traceId },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[flow trace client event]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
