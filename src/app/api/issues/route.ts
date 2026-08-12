import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireActiveSession } from '@/lib/active-session';
import { rateLimit } from '@/lib/rate-limit';
import { addIssueReport } from '@/lib/issue-store';
import { getOrCreateTraceId, recordFlowTrace } from '@/lib/flow-trace-store';
import { parseAndValidateImageDataUrl, safeUserSegment } from '@/lib/image-upload';
import type { IssueScreenshot } from '@/lib/issue-store';

export const dynamic = 'force-dynamic';

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const MAX_SCREENSHOTS = 3;

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
    const screenshotDataUrls = Array.isArray(body?.screenshots) ? body.screenshots : [];
    if (!description) {
      return NextResponse.json({ error: '請簡短說明發生的問題' }, { status: 400 });
    }
    if (!page.startsWith('/') || page.startsWith('//')) {
      return NextResponse.json({ error: 'invalid page' }, { status: 400 });
    }
    if (screenshotDataUrls.length > MAX_SCREENSHOTS) {
      return NextResponse.json({ error: `截圖最多 ${MAX_SCREENSHOTS} 張` }, { status: 400 });
    }

    const parsedScreenshots = screenshotDataUrls.map(parseAndValidateImageDataUrl);
    const invalidScreenshot = parsedScreenshots.find((screenshot) => !screenshot.ok);
    if (invalidScreenshot && !invalidScreenshot.ok) {
      return NextResponse.json({ error: invalidScreenshot.error }, { status: invalidScreenshot.status });
    }

    const screenshots: IssueScreenshot[] = [];
    const blobAvailable = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    if (parsedScreenshots.length > 0 && !blobAvailable && isProd) {
      return NextResponse.json({ error: '截圖儲存尚未設定，請稍後再試或先以文字回報' }, { status: 503 });
    }
    for (const parsed of parsedScreenshots) {
      if (!parsed.ok) continue;
      const id = randomUUID();
      if (!blobAvailable) {
        screenshots.push({ id, storageKey: `data:${parsed.mime};base64,${parsed.buffer.toString('base64')}`, contentType: parsed.mime });
        continue;
      }
      try {
        const { put } = await import('@vercel/blob');
        const pathname = `issue-reports/${safeUserSegment(auth.session.userId)}/${id}.${parsed.ext}`;
        const blob = await put(pathname, parsed.buffer, {
          access: 'private',
          contentType: parsed.mime,
        });
        screenshots.push({ id, storageKey: blob.pathname, contentType: parsed.mime });
      } catch {
        console.error('[issue screenshot] blob put failed');
        return NextResponse.json({ error: '截圖上傳失敗，請稍後再試' }, { status: 502 });
      }
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
      screenshots,
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
