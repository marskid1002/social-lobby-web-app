import { NextRequest, NextResponse } from 'next/server';
import {
  listAccounts,
  adminResetPassword,
  adminResetCustomerPassword,
  deleteAllCustomers,
  setAccountDisabled,
  deleteAccount,
  getAccount,
  createManagerAccount,
  regenerateManagerActivation,
  regenerateAccountAdminActivation,
  updateManagerNickname,
  setManagerArchived,
  deleteUnactivatedManager,
  bumpAccountSessionVersion,
  getAccountByUserId,
} from '@/lib/auth-store';
import { requireActiveSession } from '@/lib/active-session';
import { deleteUserData, clearShared, getCollection, mergeShared } from '@/lib/sync-store';
import { removeSubscriptionsForUser } from '@/lib/push-store';
import { listReports, setReportResolved } from '@/lib/report-store';
import {
  buildAdminDashboard,
  buildAdminManagerRosters,
  type AdminAccountSummary,
} from '@/lib/admin-dashboard';
import { listAdminAudit, recordAdminAudit } from '@/lib/admin-audit-store';
import { getRedis, isRedisConfigured, keyPrefix } from '@/lib/kv';
import { isSessionSecretConfigured } from '@/lib/session';
import { isSmsConfigured } from '@/lib/sms';
import { listFlowTraces } from '@/lib/flow-trace-store';
import { listIssueReports, setIssueResolved } from '@/lib/issue-store';
import { listDeviceSummaries, removeDevicesForUser } from '@/lib/device-store';
import { rateLimit } from '@/lib/rate-limit';
import { sendWebPushToUsers } from '@/lib/push-service';
import {
  createSystemMessage,
  listSystemMessages,
  updateSystemMessagePush,
} from '@/lib/system-message-store';

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
  archived?: boolean;
  activationHash?: string;
  activationCreatedAt?: string;
  createdAt: string;
}): AdminAccountSummary {
  const maskedKey = account.role === 'user' && /^\d{8,15}$/.test(account.key)
    ? `${account.key.slice(0, 3)}****${account.key.slice(-3)}`
    : account.key;
  return {
    key: maskedKey,
    accountRef: account.userId,
    role: account.role,
    tier: account.tier,
    userId: account.userId,
    nickname: account.nickname,
    hasPassword: account.hash !== null,
    disabled: Boolean(account.disabled),
    archived: Boolean(account.archived),
    hasActivationCode: Boolean(account.activationHash),
    activationCreatedAt: account.activationCreatedAt,
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
    escorts,
    photoOverrides,
    photoGalleries,
    presence,
    auditLogs,
    traceEvents,
    issues,
    devices,
    systemMessages,
    system,
  ] = await Promise.all([
    listAccounts().then((list) => list.map(safeAccount)),
    listReports(),
    getCollection('requests'),
    getCollection('responses'),
    getCollection('invitations'),
    getCollection('chatMessages'),
    getCollection('escorts'),
    getCollection('photoOverrides'),
    getCollection('photoGalleries'),
    getCollection('presence'),
    listAdminAudit(),
    listFlowTraces({ limit: 1000 }),
    listIssueReports(),
    listDeviceSummaries(),
    listSystemMessages(),
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
  const managerRosters = buildAdminManagerRosters({
    accounts,
    escorts,
    presence,
    responses,
    invitations,
  });
  const safeIssues = issues.map(({ screenshots, ...issue }) => ({
    ...issue,
    screenshots: screenshots?.map((screenshot) => ({ id: screenshot.id })) ?? [],
  }));
  const avatarByEscort = new Map(
    photoOverrides.map((item) => [stringValue(item.id), stringValue(item.avatarUrl)]),
  );
  const galleryByEscort = new Map(
    photoGalleries.map((item) => [
      stringValue(item.id),
      Array.isArray(item.urls) ? item.urls.map(stringValue).filter(Boolean) : [],
    ]),
  );
  const accountByUserId = new Map(accounts.map((account) => [account.userId, account]));
  const escortGalleries = escorts
    .filter((escort) => !escort.removed)
    .map((escort) => {
      const id = stringValue(escort.id);
      const managerId = stringValue(escort.managerId);
      const manager = accountByUserId.get(managerId);
      return {
        id,
        nickname: stringValue(escort.nickname) || '未命名',
        bio: stringValue(escort.bio),
        defaultArea: stringValue(escort.defaultArea),
        createdAt: stringValue(escort.createdAt),
        managerId,
        managerAccount: manager?.key || managerId,
        managerName: manager?.nickname || '找不到所屬帳號',
        avatarUrl: avatarByEscort.get(id) || '',
        photos: galleryByEscort.get(id) || [],
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json(
    {
      accounts,
      reports,
      dashboard,
      managerRosters,
      escortGalleries,
      systemMessages,
      system,
      auditLogs,
      traceEvents,
      issues: safeIssues,
      devices,
    },
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

    if (action === 'send-system-message') {
      const recipientId = stringValue(body.recipientId);
      const title = stringValue(body.title).trim();
      const content = stringValue(body.content).trim();
      if (!recipientId || title.length < 1 || title.length > 60 || content.length < 1 || content.length > 1000) {
        return NextResponse.json({ error: '標題需為 1–60 字，內容需為 1–1000 字' }, { status: 400 });
      }
      const recipient = await getAccountByUserId(recipientId);
      if (!recipient || !['user', 'manager'].includes(recipient.role) || recipient.disabled || recipient.archived) {
        return NextResponse.json({ error: '收件人不存在或目前無法接收訊息' }, { status: 400 });
      }
      if (confirmation !== recipient.userId) {
        return NextResponse.json({ error: '收件人確認資料不一致，請重新確認' }, { status: 400 });
      }
      const limited = await rateLimit('admin-system-message', `${admin.userId}:${recipient.userId}`, 1, 30);
      if (!limited.ok) {
        return NextResponse.json({ error: `請等待 ${limited.retryAfter} 秒後再傳給同一位使用者` }, { status: 429 });
      }
      const message = await createSystemMessage({
        recipientId: recipient.userId,
        recipientAccount: safeAccount(recipient).key,
        recipientName: recipient.nickname,
        recipientRole: recipient.role as 'user' | 'manager',
        title,
        content,
        senderId: admin.userId,
      });
      const push = await sendWebPushToUsers(
        [recipient.userId],
        `JUGA 官方通知：${title}`,
        '你收到一則官方通知，點擊登入查看內容',
        `/inbox?systemMessage=${encodeURIComponent(message.id)}`,
      ).catch((error) => {
        console.error('[admin system message push]', error instanceof Error ? error.name : 'UnknownError');
        return { sent: 0, total: 0, skipped: 'push error' };
      });
      const saved = await updateSystemMessagePush(message.id, push) ?? message;
      await audit(admin, action, recipient.userId, `messageId=${message.id};titleLength=${title.length};contentLength=${content.length}`);
      return NextResponse.json({ ok: true, message: saved });
    }

    if (action === 'create-manager') {
      const nickname = stringValue(body.nickname).trim();
      if (!nickname || nickname.length > 60) {
        return NextResponse.json({ error: '請輸入 1～60 字的幹部名稱' }, { status: 400 });
      }
      const created = await createManagerAccount(nickname);
      await mergeShared({
        registeredUsers: [{
          id: created.account.userId,
          lineUserId: created.account.userId,
          nickname: created.account.nickname,
          avatarUrl: '',
          cardImageUrl: '',
          bio: '',
          defaultArea: '信義區',
          interests: [],
          tier: 'vip',
          role: 'manager',
          credits: 0,
          monthlyRequestsLeft: 0,
          lineOAFollowed: false,
          createdAt: created.account.createdAt,
        }],
      });
      await audit(admin, action, created.account.key, `userId=${created.account.userId}`);
      return NextResponse.json({
        ok: true,
        account: created.account.key,
        activationCode: created.activationCode,
      });
    }

    if (action === 'resolve-report' || action === 'reopen-report') {
      const reportId = stringValue(body.reportId);
      if (!reportId) return NextResponse.json({ error: '缺少檢舉編號' }, { status: 400 });
      const ok = await setReportResolved(reportId, action === 'resolve-report');
      if (ok) await audit(admin, action, reportId);
      return NextResponse.json({ ok });
    }

    if (action === 'resolve-issue' || action === 'reopen-issue') {
      const issueId = stringValue(body.issueId);
      if (!issueId) return NextResponse.json({ error: '缺少問題編號' }, { status: 400 });
      const ok = await setIssueResolved(issueId, action === 'resolve-issue');
      if (ok) await audit(admin, action, issueId);
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
      return NextResponse.json(
        { error: '第二階段已改用每位幹部獨立啟用碼，請在帳號管理逐一重發' },
        { status: 409 },
      );
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
    const targetAccount = await getAccount(account) ?? await getAccountByUserId(account);
    if (!targetAccount) return NextResponse.json({ error: '找不到帳號' }, { status: 404 });
    const accountKey = targetAccount.key;
    const auditTarget = targetAccount.role === 'user' ? targetAccount.userId : targetAccount.key;

    if (action === 'edit-manager') {
      const nickname = stringValue(body.nickname).trim();
      const updated = await updateManagerNickname(accountKey, nickname);
      if (!updated) return NextResponse.json({ error: '更新失敗' }, { status: 400 });
      const profiles = await getCollection('registeredUsers');
      const profile = profiles.find((item) => item.id === updated.userId);
      if (profile) {
        await mergeShared({ registeredUsers: [{ ...profile, nickname: updated.nickname }] });
      }
      await audit(admin, action, auditTarget, '更新顯示名稱');
      return NextResponse.json({ ok: true });
    }

    if (action === 'regenerate-manager-activation') {
      const activationCode = await regenerateManagerActivation(accountKey);
      if (!activationCode) {
        return NextResponse.json({ error: '無法產生啟用碼' }, { status: 400 });
      }
      await audit(admin, action, auditTarget, '已撤銷舊碼並產生新碼');
      return NextResponse.json({ ok: true, account: accountKey, activationCode });
    }

    if (action === 'archive-manager' || action === 'unarchive-manager') {
      const archived = action === 'archive-manager';
      const ok = await setManagerArchived(accountKey, archived);
      if (ok) await audit(admin, action, auditTarget);
      return NextResponse.json({ ok });
    }

    if (action === 'logout-all-devices') {
      const target = await bumpAccountSessionVersion(accountKey);
      if (!target || target.role === 'admin') {
        return NextResponse.json({ error: '無法登出此帳號裝置' }, { status: 400 });
      }
      const count = await removeDevicesForUser(target.userId);
      await removeSubscriptionsForUser(target.userId);
      await audit(admin, action, auditTarget, `count=${count}`);
      return NextResponse.json({ ok: true, count });
    }

    if (action === 'delete-manager') {
      const expectedConfirmation = targetAccount.role === 'user'
        ? safeAccount(targetAccount).key
        : accountKey;
      if (confirmation !== expectedConfirmation) {
        return NextResponse.json({ error: '確認文字錯誤' }, { status: 400 });
      }
      const target = await getAccount(accountKey);
      if (!target || target.role !== 'manager' || target.hash !== null) {
        return NextResponse.json({ error: '僅可刪除尚未啟用的幹部' }, { status: 400 });
      }
      const [requests, responses, invitations, messages, escorts, auditLogs, traces, issues] = await Promise.all([
        getCollection('requests'),
        getCollection('responses'),
        getCollection('invitations'),
        getCollection('chatMessages'),
        getCollection('escorts'),
        listAdminAudit(200),
        listFlowTraces({ limit: 1000 }),
        listIssueReports(1000),
      ]);
      const hasHistory = requests.some((item) => item.creatorId === target.userId)
        || responses.some((item) => item.userId === target.userId || item.dispatcherId === target.userId)
        || invitations.some((item) =>
          item.fromUserId === target.userId
          || item.toUserId === target.userId
          || item.dispatcherId === target.userId)
        || messages.some((item) => item.senderId === target.userId)
        || escorts.some((item) => item.managerId === target.userId)
        || auditLogs.some((item) => item.target === accountKey || item.target === target.userId)
        || traces.some((item) => item.actorUserId === target.userId)
        || issues.some((item) => item.reporterId === target.userId);
      if (hasHistory) {
        return NextResponse.json({ error: '此幹部已有歷史紀錄，請改用封存' }, { status: 409 });
      }
      const removed = await deleteUnactivatedManager(accountKey);
      if (!removed) return NextResponse.json({ error: '刪除失敗' }, { status: 400 });
      await deleteUserData(removed.userId);
      await removeSubscriptionsForUser(removed.userId);
      await audit(admin, action, accountKey, `userId=${removed.userId}`);
      return NextResponse.json({ ok: true });
    }

    if (action === 'reset') {
      const target = await getAccount(accountKey);
      if (target?.role === 'admin') {
        return NextResponse.json({ error: '不可重設管理員密碼' }, { status: 400 });
      }
      if (target?.role === 'user') {
        const tempPassword = await adminResetCustomerPassword(accountKey);
        if (!tempPassword) return NextResponse.json({ error: '重設失敗' }, { status: 400 });
        await Promise.all([
          removeDevicesForUser(target.userId),
          removeSubscriptionsForUser(target.userId),
        ]);
        await audit(admin, action, auditTarget, '客戶臨時密碼已產生');
        return NextResponse.json({ ok: true, tempPassword });
      }
      if (target?.role === 'manager') {
        const activationCode = await regenerateManagerActivation(accountKey);
        if (!activationCode) {
          return NextResponse.json({ error: '重設失敗' }, { status: 400 });
        }
        await audit(admin, action, auditTarget, '密碼已清除並產生一次性啟用碼');
        return NextResponse.json({ ok: true, account: accountKey, activationCode });
      }
      if (target?.role === 'account_viewer') {
        const ok = await adminResetPassword(accountKey);
        if (!ok) return NextResponse.json({ error: '重設失敗' }, { status: 400 });
        await Promise.all([
          removeDevicesForUser(target.userId),
          removeSubscriptionsForUser(target.userId),
        ]);
        await audit(admin, action, auditTarget, 'A777 密碼已清除，可於首次登入自行設定');
        return NextResponse.json({ ok: true });
      }
      if (target?.role === 'account_admin') {
        const activationCode = await regenerateAccountAdminActivation(accountKey);
        if (!activationCode) {
          return NextResponse.json({ error: '重設失敗' }, { status: 400 });
        }
        await removeDevicesForUser(target.userId);
        await audit(admin, action, auditTarget, `${accountKey} 密碼已清除並產生一次性啟用碼`);
        return NextResponse.json({ ok: true, account: accountKey, activationCode });
      }
      const ok = await adminResetPassword(accountKey);
      if (ok) await audit(admin, action, auditTarget);
      return NextResponse.json({ ok });
    }

    if (action === 'disable' || action === 'enable') {
      const ok = await setAccountDisabled(accountKey, action === 'disable');
      if (ok && action === 'disable') {
        await Promise.all([
          removeDevicesForUser(targetAccount.userId),
          removeSubscriptionsForUser(targetAccount.userId),
        ]);
      }
      if (ok) await audit(admin, action, auditTarget);
      return NextResponse.json({ ok });
    }

    if (action === 'delete') {
      if (confirmation !== safeAccount(targetAccount).key) {
        return NextResponse.json({ error: '確認文字錯誤' }, { status: 400 });
      }
      const removed = await deleteAccount(accountKey);
      if (!removed) {
        return NextResponse.json(
          { error: '此帳號不可刪除（僅限客戶）' },
          { status: 400 },
        );
      }
      await deleteUserData(removed.userId);
      await removeSubscriptionsForUser(removed.userId);
      await audit(admin, action, auditTarget, `userId=${removed.userId}`);
      return NextResponse.json({ ok: true, deletedUserId: removed.userId });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[admin]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
