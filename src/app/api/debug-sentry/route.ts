import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

// 臨時驗證端點：確認錯誤能送進 Sentry。需帶正確 ADMIN_SECRET 才能觸發。
// 驗證完成後應移除本檔。未設 SENTRY_DSN 時 captureException 為 no-op。
export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const eventId = Sentry.captureException(new Error('Sentry 驗證測試錯誤（可忽略）'));
  await Sentry.flush(2000);
  return NextResponse.json({
    ok: true,
    eventId,
    dsnConfigured: Boolean(process.env.SENTRY_DSN),
  });
}
