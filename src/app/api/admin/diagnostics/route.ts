import { NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { runSystemDiagnostics } from '@/lib/system-diagnostics';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    if (auth.account?.key !== 'A000' || auth.account.role !== 'admin' || auth.session.role !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return NextResponse.json({ checks: await runSystemDiagnostics() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: '診斷授權／帳號資料讀取失敗，尚未執行服務檢查。請查伺服器與 Redis 紀錄。' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
