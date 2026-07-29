import { NextRequest, NextResponse } from 'next/server';
import {
  listAccounts,
  adminResetPassword,
  adminResetCustomerPassword,
  resetAllManagerPasswords,
  deleteAllCustomers,
  setAccountDisabled,
  deleteAccount,
  getAccount,
} from '@/lib/auth-store';
import { requireActiveSession } from '@/lib/active-session';
import { deleteUserData, clearShared, getCollection } from '@/lib/sync-store';
import { removeSubscriptionsForUser } from '@/lib/push-store';
import { listReports, setReportResolved } from '@/lib/report-store';
import { buildAdminDashboard, type AdminAccountSummary } from '@/lib/admin-dashboard';
import { listAdminAudit, recordAdminAudit } from '@/lib/admin-audit-store';
import { getRedis, isRedisConfigured, keyPrefix } from '@/lib/kv';
import { isSessionSecretConfigured } from '@/lib/session';
import { isSmsConfigured } from '@/lib/sms';

export const dynamic = 'force-dynamic';

type AdminAuth = {
  userId: string;
  accountKey: string;
};

type AdminAuthResult =
  | { ok: true; admin: AdminAuth }
  | { ok: false; response: NextResponse };

async function requireA000(req: NextRequest): Promise<AdminAuthResult> {
  const auth = await requireActiveSession(req);
  if (!auth.ok) return { ok: false, response: auth.response };
  if (
    auth.isGuest
    || auth.session.role !== 'admin'
    || auth.account?.role !== 'admin'
    || auth.account.key !== 'A000'
  ) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    };
  }
  return {
    ok: true,
    admin: { userId: auth.session.userId, accountKey: auth.account.key },
  };
}

function safeAccount(account: {
  key: string;
  role: string;
  tier: string;
  userId: string;
  nickname: string;
  hash: string | null;
  disabled?: boolean;
  createdAt: string;
}): AdminAccountSummary {
  return {
    key: account.key,
    role: account.role,
    tier: account.tier,
    userId: account.userId,
    nickname: account.nickname,
    hasPassword: account.hash !== null,
    disabled: Boolean(account.disabled),
    createdAt: account.createdAt,
  };
}

const stringValue = (value: unknown): string =>
  typeof value === 'string' ? value : '';

async function getSystemStatus() {
  const redisConfigured = isRedisConfigured();
  let redisPing = false;
  if (redisConfigured) {
    try {
      const redis = getRedis();
      if (redis) {
        await redis.ping();
        redisPing = true;
      }
    } catch {
      redisPing = false;
    }
  }
  const sessionSecretConfigured = isSessionSecretConfigured();
  const smsConfigured = isSmsConfigured();
  const pushConfigured = Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
  const blobConfigured = Boolean(
    process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID,
  );
  const sentryConfigured = Boolean(
    process.env.SENTRY_DSN && process.env.NEXT_PUBLIC_SENTRY_DSN,
  );
  return {
    ready: redisPing && sessionSecretConfigured && smsConfigured,
    redisConfigured,
    redisPing,
    sessionSecretConfigured,
    smsConfigured,
    pushConfigured,
    blobConfigured,
    sentryConfigured,
    keyPrefix: keyPrefix(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || 'local',
  };
}

// A000 點開某一則聊天室時才載入內容，避免後台首頁一次下載所有私人訊息。
async function getConversationDetail(req: NextRequest) {
  const url = new URL(req.url);
  const threadId = url.searchParams.get('threadId')?.trim() ?? '';
  const requestedRequestId = url.searchParams.get('requestId');
  if (!threadId || threadId.length > 256) {
    return NextResponse.json({ error: 'invalid threadId' }, { status: 400 });
  }
  const messages = (await getCollection('chatMessages'))
    .filter((message) => {
      if (message.threadId !== threadId) return false;
      const messageRequestId = stringValue(message.requestId);
      return requestedRequestId === null
        ? true
        : messageRequestId === requestedRequestId;
    })
    .sort((a, b) => stringValue(a.createdAt).localeCompare(stringValue(b.createdAt)))
    .slice(-500)
    .map((message) => ({
      id: message.id,
      senderId: stringValue(message.senderId),
      text: stringValue(message.text),
      imageUrl: stringValue(message.imageUrl) || undefined,
      requestId: stringValue(message.requestId) || undefined,
      createdAt: stringValue(message.createdAt),
    }));
  return NextResponse.json(
    { threadId, requestId: requestedRequestId || null, messages },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(req: NextRequest) {
  const auth = await requireA000(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  if (url.searchParams.has('threadId')) return getConversationDetail(req);

  const [
    accounts,
    reports,
    requests,
    responses,
    invitations,
    chatMessages,
    auditLogs,
    system,
  ] = await Promise.all([
    listAccounts().then((list) => list.map(safeAccount)),
    listReports(),
    getCollection('requests'),
    getCollection('responses'),
    getCollection('invitations'),
    getCollection('chatMessages'),
    listAdminAudit(),
    getSystemStatus(),
  ]);

  const dashboard = buildAdminDashboard({
    accounts,
    reports,
    requests,
    responses,
    invitations,
    chatMessages,
  });

  return NextResponse.json(
    { accounts, reports, dashboard, system, auditLogs },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

async function audit(
  admin: AdminAuth,
  action: string,
  target?: string,
  detail?: string,
): Promise<void> {
  await recordAdminAudit({
    adminUserId: admin.userId,
    action,
    target,
    detail,
  }).catch((error) => {
    console.error('[admin audit]', error instanceof Error ? error.name : 'UnknownError');
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireA000(req);
  if (!auth.ok) return auth.response;
  const admin = auth.admin;

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });
    const action = stringValue(body.action);
    const account = stringValue(body.account);
    const confirmation = stringValue(body.confirmation);

    if (action === 'resolve-report' || action === 'reopen-report') {
      const reportId = stringValue(body.reportId);
      if (!reportId) return NextResponse.json({ error: '缺少檢舉編號' }, { status: 400 });
      const ok = await setReportResolved(reportId, action === 'resolve-report');
      if (ok) await audit(admin, action, reportId);
      return NextResponse.json({ ok });
    }

    if (action === 'clear-shared') {
      if (confirmation !== 'CLEAR SHARED') {
        return NextResponse.json({ error: '確認文字錯誤' }, { status: 400 });
      }
      await clearShared([
        'requests',
        'responses',
        'invitations',
        'updates',
        'chatMessages',
        'momentPosts',
        'plazaComments',
      ]);
      await audit(admin, action, undefined, '清除局、邀請、通知、對話與廣場');
      return NextResponse.json({ ok: true });
    }

    if (action === 'reset-all-managers') {
      if (confirmation !== 'RESET MANAGERS') {
        return NextResponse.json({ error: '確認文字錯誤' }, { status: 400 });
      }
      const count = await resetAllManagerPasswords();
      await audit(admin, action, undefined, `count=${count}`);
      return NextResponse.json({ ok: true, count });
    }

    if (action === 'delete-all-customers') {
      if (confirmation !== 'DELETE CUSTOMERS') {
        return NextResponse.json({ error: '確認文字錯誤' }, { status: 400 });
      }
      const removed = await deleteAllCustomers();
      for (const customer of removed) {
        await deleteUserData(customer.userId);
        await removeSubscriptionsForUser(customer.userId);
      }
      await audit(admin, action, undefined, `count=${removed.length}`);
      return NextResponse.json({ ok: true, count: removed.length });
    }

    if (!account) return NextResponse.json({ error: '缺少帳號' }, { status: 400 });

    if (action === 'reset') {
      const target = await getAccount(account);
      if (target?.role === 'admin') {
        return NextResponse.json({ error: '不可重設管理員密碼' }, { status: 400 });
      }
      if (target?.role === 'user') {
        const tempPassword = await adminResetCustomerPassword(account);
        if (!tempPassword) return NextResponse.json({ error: '重設失敗' }, { status: 400 });
        await audit(admin, action, account, '客戶臨時密碼已產生');
        return NextResponse.json({ ok: true, tempPassword });
      }
      const ok = await adminResetPassword(account);
      if (ok) await audit(admin, action, account);
      return NextResponse.json({ ok });
    }

    if (action === 'disable' || action === 'enable') {
      const ok = await setAccountDisabled(account, action === 'disable');
      if (ok) await audit(admin, action, account);
      return NextResponse.json({ ok });
    }

    if (action === 'delete') {
      if (confirmation !== account) {
        return NextResponse.json({ error: '確認文字錯誤' }, { status: 400 });
      }
      const removed = await deleteAccount(account);
      if (!removed) {
        return NextResponse.json(
          { error: '此帳號不可刪除（僅限客戶）' },
          { status: 400 },
        );
      }
      await deleteUserData(removed.userId);
      await removeSubscriptionsForUser(removed.userId);
      await audit(admin, action, account, `userId=${removed.userId}`);
      return NextResponse.json({ ok: true, deletedUserId: removed.userId });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[admin]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
