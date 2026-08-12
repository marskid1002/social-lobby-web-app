import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { getIssueReport } from '@/lib/issue-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireActiveSession(req);
  if (
    !auth.ok
    || auth.isGuest
    || auth.session.role !== 'admin'
    || auth.account?.role !== 'admin'
    || auth.account.key !== 'A000'
  ) {
    return auth.ok
      ? NextResponse.json({ error: 'forbidden' }, { status: 403 })
      : auth.response;
  }

  const url = new URL(req.url);
  const issueId = url.searchParams.get('issueId')?.trim() ?? '';
  const screenshotId = url.searchParams.get('screenshotId')?.trim() ?? '';
  if (!issueId || !screenshotId || issueId.length > 128 || screenshotId.length > 128) {
    return NextResponse.json({ error: 'invalid screenshot' }, { status: 400 });
  }

  const issue = await getIssueReport(issueId);
  const screenshot = issue?.screenshots?.find((item) => item.id === screenshotId);
  if (!screenshot) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (screenshot.storageKey.startsWith('data:')) {
    const comma = screenshot.storageKey.indexOf(',');
    if (comma < 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return new Response(Buffer.from(screenshot.storageKey.slice(comma + 1), 'base64'), {
      headers: {
        'Content-Type': screenshot.contentType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  try {
    const { get } = await import('@vercel/blob');
    const blob = await get(screenshot.storageKey, { access: 'private' });
    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return new Response(blob.stream, {
      headers: {
        'Content-Type': screenshot.contentType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    console.error('[admin issue image] blob get failed');
    return NextResponse.json({ error: 'image unavailable' }, { status: 502 });
  }
}
