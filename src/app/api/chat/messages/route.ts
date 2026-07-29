import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { getCollection, mergeShared } from '@/lib/sync-store';
import { authorizeWrites, buildIndex } from '@/lib/sync-authz';
import { canonicalThreadId } from '@/lib/chat-authz';
import { sendWebPushToUsers } from '@/lib/push-service';
import { getOrCreateTraceId, recordFlowTrace } from '@/lib/flow-trace-store';

export const dynamic = 'force-dynamic';

const nonEmpty = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    if (auth.isGuest) {
      return NextResponse.json({ error: 'guest is read-only' }, { status: 403 });
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !nonEmpty(body.threadId, 256)) {
      return NextResponse.json({ error: 'invalid threadId' }, { status: 400 });
    }
    if (typeof body.text !== 'string' || body.text.length > 4000) {
      return NextResponse.json({ error: 'invalid text' }, { status: 400 });
    }
    if (body.imageUrl !== undefined && (!nonEmpty(body.imageUrl, 2048))) {
      return NextResponse.json({ error: 'invalid imageUrl' }, { status: 400 });
    }
    if (!body.text.trim() && body.imageUrl === undefined) {
      return NextResponse.json({ error: 'empty message' }, { status: 400 });
    }
    if (body.requestId !== undefined && !nonEmpty(body.requestId, 128)) {
      return NextResponse.json({ error: 'invalid requestId' }, { status: 400 });
    }

    const [requests, responses, invitations, blocks, chatMessages] = await Promise.all([
      getCollection('requests'),
      getCollection('responses'),
      getCollection('invitations'),
      getCollection('blocks'),
      getCollection('chatMessages'),
    ]);
    const message = {
      id: `cm-${crypto.randomUUID()}`,
      threadId: body.threadId,
      senderId: auth.session.userId,
      text: body.text,
      ...(typeof body.imageUrl === 'string' ? { imageUrl: body.imageUrl } : {}),
      ...(typeof body.requestId === 'string' ? { requestId: body.requestId } : {}),
      createdAt: new Date().toISOString(),
    };
    const authorized = authorizeWrites(
      { chatMessages: [message] },
      auth.session,
      buildIndex({ requests, responses, invitations, blocks, chatMessages }),
    );
    const accepted = Array.isArray(authorized.chatMessages)
      ? authorized.chatMessages as Record<string, unknown>[]
      : [];
    if (accepted.length !== 1 || accepted[0].id !== message.id) {
      return NextResponse.json(
        { error: '聊天室尚未建立或已關閉', code: 'CHAT_UNAVAILABLE' },
        { status: 409 },
      );
    }

    await mergeShared({ chatMessages: [message] });
    const messageRequestId = typeof body.requestId === 'string' ? body.requestId : null;
    const traceId = messageRequestId
      ? await getOrCreateTraceId(messageRequestId)
      : `tr-${crypto.randomUUID()}`;
    await recordFlowTrace({
      traceId,
      eventType: 'message.stored',
      actorUserId: auth.session.userId,
      requestId: messageRequestId ?? undefined,
      threadId: body.threadId,
      entityId: message.id,
      detail: typeof body.imageUrl === 'string' ? 'image' : 'text',
      dedupeKey: `message.stored:${message.id}`,
    }).catch((error) => {
      console.error('[flow trace message]', error instanceof Error ? error.name : 'UnknownError');
    });

    // Only the server decides recipients, and only after the message is stored.
    const recipients = new Set<string>();
    for (const invitation of invitations) {
      if (invitation.status !== 'accepted') continue;
      const invitationRequestId = typeof invitation.requestId === 'string'
        ? invitation.requestId
        : null;
      if (invitationRequestId !== messageRequestId) continue;
      const from = typeof invitation.fromUserId === 'string' ? invitation.fromUserId : '';
      const to = typeof invitation.toUserId === 'string' ? invitation.toUserId : '';
      if (!from || !to) continue;

      if (invitation.groupThreadId === body.threadId) {
        recipients.add(from);
        recipients.add(to);
      } else if (canonicalThreadId(from, to) === body.threadId) {
        if (from === auth.session.userId) recipients.add(to);
        if (to === auth.session.userId) recipients.add(from);
      }
    }
    recipients.delete(auth.session.userId);

    let pushResult: { sent: number; total?: number; skipped?: string } = {
      sent: 0,
      skipped: 'no recipients',
    };
    if (recipients.size > 0) {
      const preview = typeof body.imageUrl === 'string'
        ? '傳送了一張照片'
        : body.text.length > 40
          ? `${body.text.slice(0, 40)}…`
          : body.text;
      const chatUrl = `/chat/${encodeURIComponent(body.threadId)}${
        messageRequestId
          ? `?req=${encodeURIComponent(messageRequestId)}&src=push`
          : '?src=push'
      }`;
      pushResult = await sendWebPushToUsers(
        [...recipients],
        `${auth.account?.nickname ?? '對方'} 傳來訊息`,
        preview,
        chatUrl,
      ).catch((error) => {
        console.error('[chat message push]', error instanceof Error ? error.name : 'UnknownError');
        return { sent: 0, total: 0, skipped: 'push error' };
      });
    }
    await recordFlowTrace({
      traceId,
      eventType: 'message.push',
      outcome: pushResult.sent > 0 ? 'success' : 'skipped',
      actorUserId: auth.session.userId,
      requestId: messageRequestId ?? undefined,
      threadId: body.threadId,
      entityId: message.id,
      code: pushResult.skipped,
      detail: `sent=${pushResult.sent};total=${pushResult.total ?? 0}`,
      dedupeKey: `message.push:${message.id}`,
    }).catch((error) => {
      console.error('[flow trace message push]', error instanceof Error ? error.name : 'UnknownError');
    });

    return NextResponse.json(
      { ok: true, message, traceId },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[chat message]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
