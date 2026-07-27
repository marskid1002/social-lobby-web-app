import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { addReport } from '@/lib/report-store';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const MAX_REASON = 500;

// 使用者送出檢舉（訪客不可）
export async function POST(req: NextRequest) {
  // F：需登入且帳號仍有效（含登入後被停用/刪除者），在 rate limit 與建立檢舉資料之前擋下。
  const auth = await requireActiveSession(req);
  if (!auth.ok) return auth.response;
  if (auth.isGuest) return NextResponse.json({ error: 'guest is read-only' }, { status: 403 });
  const session = auth.session;

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
