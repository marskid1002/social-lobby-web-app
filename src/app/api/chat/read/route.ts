import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { buildChatAccessIndex, canReadChatThread } from '@/lib/chat-authz';
import { getCollection, mergeShared } from '@/lib/sync-store';

export const dynamic = 'force-dynamic';

const validText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

async function readReceiptId(userId: string, threadId: string, requestId?: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${userId}\u0000${threadId}\u0000${requestId ?? ''}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return `cr-${hash}`;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    if (auth.isGuest) {
      return NextResponse.json({ error: 'guest is read-only' }, { status: 403 });
    }

    const body = await req.json().catch(() => null) as {
      threadId?: unknown;
      requestId?: unknown;
    } | null;
    if (!validText(body?.threadId, 256)) {
      return NextResponse.json({ error: 'invalid threadId' }, { status: 400 });
    }
    if (body?.requestId !== undefined && !validText(body.requestId, 128)) {
      return NextResponse.json({ error: 'invalid requestId' }, { status: 400 });
    }

    const [invitations, responses, requests, messages, reads] = await Promise.all([
      getCollection('invitations'),
      getCollection('responses'),
      getCollection('requests'),
      getCollection('chatMessages'),
      getCollection('chatReads'),
    ]);
    const access = buildChatAccessIndex(auth.session.userId, { invitations, responses, requests });
    if (!canReadChatThread(body.threadId, access)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const requestId = typeof body.requestId === 'string' ? body.requestId : undefined;
    const latest = messages
      .filter((message) =>
        message.threadId === body.threadId
        && (typeof message.requestId === 'string' ? message.requestId : undefined) === requestId
      )
      .sort((a, b) => Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt)))[0];
    const existing = reads.find((read) =>
      read.userId === auth.session.userId
      && read.threadId === body.threadId
      && (typeof read.requestId === 'string' ? read.requestId : undefined) === requestId
    );
    const read = {
      id: existing?.id ?? await readReceiptId(auth.session.userId, body.threadId, requestId),
      userId: auth.session.userId,
      threadId: body.threadId,
      ...(requestId ? { requestId } : {}),
      ...(latest?.id ? { lastReadMessageId: latest.id } : {}),
      lastReadAt: latest?.createdAt ? String(latest.createdAt) : new Date().toISOString(),
    };
    await mergeShared({ chatReads: [read] });

    return NextResponse.json({ ok: true, read }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[chat read]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
