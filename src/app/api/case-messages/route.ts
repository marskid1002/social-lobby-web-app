import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { appendCaseMessage, getCaseThread, type CaseKind } from '@/lib/case-thread-store';
import { getSystemMessageForUser } from '@/lib/system-message-store';
import { getReport, setReportResolved } from '@/lib/report-store';
import { getIssueReport, setIssueResolved } from '@/lib/issue-store';
import { getAccount } from '@/lib/auth-store';
import { rateLimit } from '@/lib/rate-limit';
import { sendWebPushToUsers } from '@/lib/push-service';

export const dynamic = 'force-dynamic';

const MAX_CONTENT = 1000;

async function authorizedCase(userId: string, systemMessageId: string) {
  const message = await getSystemMessageForUser(userId, systemMessageId);
  if (!message?.caseKind || !message.caseId) return null;
  const kind = message.caseKind as CaseKind;
  const record = kind === 'report'
    ? await getReport(message.caseId)
    : await getIssueReport(message.caseId);
  if (!record || record.reporterId !== userId) return null;
  return { kind, caseId: message.caseId, record };
}

export async function GET(req: NextRequest) {
  const auth = await requireActiveSession(req);
  if (!auth.ok) return auth.response;
  if (auth.isGuest) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const systemMessageId = new URL(req.url).searchParams.get('systemMessageId')?.trim() ?? '';
  if (!systemMessageId || systemMessageId.length > 100) {
    return NextResponse.json({ error: 'invalid message' }, { status: 400 });
  }
  const access = await authorizedCase(auth.session.userId, systemMessageId);
  if (!access) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const thread = await getCaseThread(access.kind, access.caseId);
  return NextResponse.json({
    caseId: access.caseId,
    kind: access.kind,
    status: thread?.status ?? 'pending_admin',
    messages: (thread?.messages ?? []).map(({ senderId: _senderId, ...message }) => message),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = await requireActiveSession(req);
  if (!auth.ok) return auth.response;
  if (auth.isGuest) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await rateLimit('case-reply', auth.session.userId, 10, 10 * 60);
  if (!limited.ok) {
    return NextResponse.json({ error: '回覆過於頻繁，請稍後再試' }, { status: 429 });
  }
  const body = await req.json().catch(() => null) as { systemMessageId?: unknown; content?: unknown } | null;
  const systemMessageId = typeof body?.systemMessageId === 'string' ? body.systemMessageId.trim() : '';
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (!systemMessageId || systemMessageId.length > 100 || !content || content.length > MAX_CONTENT) {
    return NextResponse.json({ error: '請輸入 1–1000 字的回覆內容' }, { status: 400 });
  }
  const access = await authorizedCase(auth.session.userId, systemMessageId);
  if (!access) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const thread = await appendCaseMessage({
    kind: access.kind,
    caseId: access.caseId,
    reporterId: auth.session.userId,
    senderId: auth.session.userId,
    senderRole: 'reporter',
    content,
  });
  if (access.kind === 'report') await setReportResolved(access.caseId, false);
  else await setIssueResolved(access.caseId, false);

  const admin = await getAccount('A000');
  if (admin && !admin.disabled) {
    await sendWebPushToUsers(
      [admin.userId],
      '案件收到新回覆',
      '使用者已補充案件內容，請登入 A000 後台查看',
      '/admin',
    ).catch((error) => {
      console.error('[case reply push]', error instanceof Error ? error.name : 'UnknownError');
    });
  }
  return NextResponse.json({
    ok: true,
    status: thread.status,
    messages: thread.messages.map(({ senderId: _senderId, ...message }) => message),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
