import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { rateLimit } from '@/lib/rate-limit';
import { addIssueReport } from '@/lib/issue-store';
import { getOrCreateTraceId, recordFlowTrace } from '@/lib/flow-trace-store';

export const dynamic = 'force-dynamic';

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export async function POST(req: NextRequest) {
  const auth = await requireActiveSession(req);
  if (!auth.ok) return auth.response;
  if (auth.isGuest) {
    return NextResponse.json({ error: 'guest is read-only' }, { status: 403 });
  }

  const limited = await rateLimit('issue-report', auth.session.userId, 5, 10 * 60);
  if (!limited.ok) {
    return NextResponse.json({ error: '回報過於頻繁，請稍後再試' }, { status: 429 });
  }

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const description = text(body?.description, 1000);
    const page = text(body?.page, 300);
    const requestId = text(body?.requestId, 128);
    const threadId = text(body?.threadId, 256);
    if (!description) {
      return NextResponse.json({ error: '請簡短說明發生的問題' }, { status: 400 });
    }
    if (!page.startsWith('/') || page.startsWith('//')) {
      return NextResponse.json({ error: 'invalid page' }, { status: 400 });
    }

    const traceId = requestId ? await getOrCreateTraceId(requestId) : undefined;
    const issue = await addIssueReport({
      reporterId: auth.session.userId,
      description,
      page,
      requestId: requestId || undefined,
      threadId: threadId || undefined,
      traceId,
      lastErrorCode: text(body?.lastErrorCode, 160) || undefined,
      userAgent: req.headers.get('user-agent') ?? 'unknown',
    });
    await recordFlowTrace({
      traceId,
      eventType: 'issue.reported',
      actorUserId: auth.session.userId,
      requestId: requestId || undefined,
      threadId: threadId || undefined,
      entityId: issue.id,
      dedupeKey: `issue.reported:${issue.id}`,
    }).catch((error) => {
      console.error('[issue trace]', error instanceof Error ? error.name : 'UnknownError');
    });
    return NextResponse.json(
      { ok: true, id: issue.id, traceId },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[issue report]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
