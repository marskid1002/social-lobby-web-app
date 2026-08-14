import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { getManagerUserIds } from '@/lib/auth-store';
import { sendWebPushToUsers } from '@/lib/push-service';
import {
  claimReminderCooldown,
  getReminderNextAt,
  REQUEST_REMINDER_COOLDOWN_SECONDS,
} from '@/lib/request-reminder-store';
import { getCollection, mergeShared } from '@/lib/sync-store';

export const dynamic = 'force-dynamic';

type StoredRequest = {
  id: string;
  creatorId?: unknown;
  status?: unknown;
  createdAt?: unknown;
  expiresAt?: unknown;
  area?: unknown;
};

function validRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 120;
}

function activeRequestError(request: StoredRequest | undefined, userId: string): NextResponse | null {
  if (!request) return NextResponse.json({ error: '找不到這個局' }, { status: 404 });
  if (request.creatorId !== userId) return NextResponse.json({ error: '沒有操作權限' }, { status: 403 });
  const expiresAt = Date.parse(String(request.expiresAt ?? ''));
  if (request.status !== 'open' || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return NextResponse.json({ error: '這個局已經結束' }, { status: 409 });
  }
  return null;
}

function initialNextAt(request: StoredRequest): number {
  const createdAt = Date.parse(String(request.createdAt ?? ''));
  return Number.isFinite(createdAt)
    ? createdAt + REQUEST_REMINDER_COOLDOWN_SECONDS * 1000
    : 0;
}

async function loadOwnedActiveRequest(requestId: string, userId: string) {
  const requests = await getCollection('requests') as StoredRequest[];
  const request = requests.find((item) => item.id === requestId);
  return { request, error: activeRequestError(request, userId) };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    if (auth.isGuest) return NextResponse.json({ error: '訪客無法使用此功能' }, { status: 403 });

    const requestId = req.nextUrl.searchParams.get('requestId');
    if (!validRequestId(requestId)) {
      return NextResponse.json({ error: '無效的局編號' }, { status: 400 });
    }
    const { request, error } = await loadOwnedActiveRequest(requestId, auth.session.userId);
    if (error || !request) return error!;

    const nextAt = Math.max(initialNextAt(request), await getReminderNextAt(requestId));
    return NextResponse.json({ ok: true, nextReminderAt: nextAt }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[request reminder status]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: '暫時無法讀取提醒狀態' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    if (auth.isGuest) return NextResponse.json({ error: '訪客無法使用此功能' }, { status: 403 });

    const body = await req.json().catch(() => null) as { requestId?: unknown } | null;
    if (!validRequestId(body?.requestId)) {
      return NextResponse.json({ error: '無效的局編號' }, { status: 400 });
    }
    const requestId = body.requestId;
    const { request, error } = await loadOwnedActiveRequest(requestId, auth.session.userId);
    if (error || !request) return error!;

    const firstAvailableAt = initialNextAt(request);
    if (firstAvailableAt > Date.now()) {
      return NextResponse.json({
        error: '尚未到可提醒時間',
        nextReminderAt: firstAvailableAt,
      }, { status: 429 });
    }

    const cooldown = await claimReminderCooldown(requestId);
    if (!cooldown.ok) {
      return NextResponse.json({
        error: '每 5 分鐘可提醒一次',
        nextReminderAt: cooldown.nextAt,
      }, { status: 429 });
    }

    const managerUserIds = await getManagerUserIds();
    const now = new Date().toISOString();
    const updates = managerUserIds.map((userId) => ({
      id: `ue-reminder-${randomUUID()}`,
      userId,
      actorId: auth.session.userId,
      eventType: 'request_posted',
      refRequestId: requestId,
      createdAt: now,
      read: false,
    }));
    if (updates.length > 0) await mergeShared({ updates });

    const area = typeof request.area === 'string' && request.area ? `（${request.area}）` : '';
    const pushResult = await sendWebPushToUsers(
      managerUserIds,
      '有新的局',
      `${auth.account?.nickname ?? '客戶'}提醒有新局${area}，點擊查看詳情`,
      `/requests/${encodeURIComponent(requestId)}`,
      { badgeKey: `request:${requestId}` },
    ).catch((pushError) => {
      console.error('[request reminder push]', pushError instanceof Error ? pushError.name : 'UnknownError');
      return { sent: 0, total: 0, skipped: 'push error' };
    });

    return NextResponse.json({
      ok: true,
      nextReminderAt: cooldown.nextAt,
      notifiedCount: managerUserIds.length,
      pushSent: pushResult.sent,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[request reminder]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: '提醒發送失敗，請稍後再試' }, { status: 500 });
  }
}
