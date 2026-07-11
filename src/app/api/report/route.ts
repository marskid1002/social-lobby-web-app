import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { addReport } from '@/lib/report-store';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const MAX_REASON = 500;

// 使用者送出檢舉（訪客不可）
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role === 'guest') return NextResponse.json({ error: 'guest is read-only' }, { status: 403 });

  // 限流：每人每 10 分鐘最多 10 筆，避免濫檢舉
  const rl = await rateLimit('report', session.userId, 10, 10 * 60);
  if (!rl.ok) return NextResponse.json({ error: '檢舉過於頻繁，請稍後再試' }, { status: 429 });

  try {
    const body = await req.json();
    const targetId = String(body.targetId ?? '');
    if (!targetId) return NextResponse.json({ error: '缺少檢舉對象' }, { status: 400 });
    const report = await addReport({
      reporterId: session.userId,
      targetId,
      targetName: body.targetName ? String(body.targetName).slice(0, 60) : undefined,
      reason: String(body.reason ?? '').slice(0, MAX_REASON),
    });
    return NextResponse.json({ ok: true, id: report.id });
  } catch (e) {
    console.error('[report]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
