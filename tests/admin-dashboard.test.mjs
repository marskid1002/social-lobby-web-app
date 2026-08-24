// A000 管理後台測試：純流程診斷 + production /api/admin 權限與確認文字。
// 執行：
// node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/admin-dashboard.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const { buildAdminDashboard, buildAdminManagerRosters } = await import('@/lib/admin-dashboard');
const { GET, POST } = await import('@/app/api/admin/route');
const { listAdminAudit, recordAdminAudit } = await import('@/lib/admin-audit-store');
const { signSession } = await import('@/lib/session');
const authStore = await import('@/lib/auth-store');
const store = await import('@/lib/sync-store');

const REDIS = Boolean(
  process.env.KV_REST_API_URL
  || process.env.KV_URL
  || process.env.UPSTASH_REDIS_REST_URL
  || process.env.REDIS_URL
);
const skip = REDIS ? '偵測到 Redis 環境變數：跳過 route 測試以免碰 production' : false;
const NOW = Date.parse('2026-07-30T12:00:00.000Z');
const FUTURE = '2026-07-31T12:00:00.000Z';
// 上方 NOW 是「純流程診斷」測試注入 buildAdminDashboard 的固定時間，不受資料保留規則影響。
// 但經過真實 store 的測試（mergeShared → getShared → planDataRetention 以實際 Date.now() 判斷）
// 必須使用相對於執行當下的時間，否則 request 會被 8 小時、chatMessages 會被 48 小時保留規則清除。
const RECENT = new Date(Date.now() - 5 * 60_000).toISOString();       // 5 分鐘前
const RECENT_LATER = new Date(Date.now() - 4 * 60_000).toISOString(); // 4 分鐘前（晚於 RECENT，維持訊息先後順序）

test('幹部人員統計：依 managerId 隔離，且不顯示舊的軟刪除資料', () => {
  const rosters = buildAdminManagerRosters({
    accounts: [
      account('A001', 'manager-a', '幹部 A', 'manager'),
      account('A002', 'manager-b', '幹部 B', 'manager'),
    ],
    escorts: [
      { id: 'girl-a1', managerId: 'manager-a', nickname: '小安', createdAt: '2026-07-30T10:00:00Z' },
      { id: 'girl-a2', managerId: 'manager-a', nickname: '小美', createdAt: '2026-07-30T10:01:00Z', removed: true },
      { id: 'girl-b1', managerId: 'manager-b', nickname: '小雨', createdAt: '2026-07-30T10:02:00Z' },
    ],
    presence: [{ id: 'girl-a1', online: true }],
    responses: [{ id: 'response-b1', requestId: 'request-b', userId: 'girl-b1' }],
    invitations: [{
      id: 'invitation-b1',
      requestId: 'request-b',
      responseId: 'response-b1',
      status: 'accepted',
      managerDecision: 'confirmed',
      chatExpiresAt: FUTURE,
    }],
    now: NOW,
  });

  assert.equal(rosters.length, 2);
  assert.deepEqual(
    rosters.map(({ managerId, activeCount, removedCount, totalCreated }) => ({ managerId, activeCount, removedCount, totalCreated })),
    [
      { managerId: 'manager-a', activeCount: 1, removedCount: 0, totalCreated: 1 },
      { managerId: 'manager-b', activeCount: 1, removedCount: 0, totalCreated: 1 },
    ],
  );
  assert.equal(rosters[0].members.find((member) => member.id === 'girl-a1').status, 'online');
  assert.equal(rosters[0].members.some((member) => member.id === 'girl-a2'), false);
  assert.equal(rosters[1].members[0].status, 'busy');
});

function account(key, userId, nickname, role = 'user') {
  return {
    key,
    userId,
    nickname,
    role,
    tier: role === 'manager' ? 'vip' : 'standard',
    hasPassword: true,
    disabled: false,
    createdAt: '2026-07-30T00:00:00.000Z',
  };
}

async function adminRequest(method = 'GET', body, session = {
  userId: 'u-016',
  role: 'admin',
  tier: 'admin',
}, query = '') {
  const token = await signSession(session);
  return (method === 'GET' ? GET : POST)(new Request(`http://localhost/api/admin${query}`, {
    method,
    headers: {
      cookie: `sl_session=${encodeURIComponent(token)}`,
      'content-type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
}

test('流程診斷：joining 但沒有 accepted invitation → 明確標記聊天室未建立', () => {
  const dashboard = buildAdminDashboard({
    accounts: [account('0912000000', 'customer-1', '客戶一')],
    reports: [],
    requests: [{
      id: 'request-broken',
      creatorId: 'customer-1',
      area: '大安區',
      requestType: 'drinking',
      status: 'open',
      createdAt: '2026-07-30T10:00:00.000Z',
      expiresAt: FUTURE,
    }],
    responses: [{
      id: 'response-broken',
      requestId: 'request-broken',
      userId: 'escort-1',
      responseStatus: 'joining',
      createdAt: '2026-07-30T10:05:00.000Z',
    }],
    invitations: [],
    chatMessages: [],
    now: NOW,
  });

  assert.equal(dashboard.overview.brokenFlows, 1);
  assert.equal(dashboard.flows[0].health, 'error');
  assert.match(dashboard.flows[0].issue, /聊天室尚未建立/);
  assert.equal(dashboard.flows[0].steps.find((step) => step.key === 'chat')?.state, 'error');
});

test('流程診斷：聊天室與訊息完成 → healthy；相同 thread 不同 request 分開摘要', () => {
  const accounts = [
    account('0912000001', 'customer-1', '客戶一'),
    account('A001', 'manager-1', '幹部一', 'manager'),
  ];
  const baseRequest = {
    creatorId: 'customer-1',
    area: '信義區',
    requestType: 'after_party',
    status: 'open',
    createdAt: '2026-07-30T10:00:00.000Z',
    expiresAt: FUTURE,
  };
  const dashboard = buildAdminDashboard({
    accounts,
    escorts: [
      { id: 'escort-active', managerId: 'manager-1', removed: false },
      { id: 'escort-removed', managerId: 'manager-1', removed: true },
    ],
    reports: [{ resolved: false }],
    requests: [{ ...baseRequest, id: 'request-1' }, { ...baseRequest, id: 'request-2' }],
    responses: [{
      id: 'response-1',
      requestId: 'request-1',
      userId: 'escort-1',
      dispatcherId: 'manager-1',
      responseStatus: 'joining',
      createdAt: '2026-07-30T10:05:00.000Z',
    }],
    invitations: [{
      id: 'invite-1',
      requestId: 'request-1',
      fromUserId: 'manager-1',
      toUserId: 'customer-1',
      status: 'accepted',
      chatExpiresAt: FUTURE,
      createdAt: '2026-07-30T10:06:00.000Z',
    }],
    chatMessages: [
      {
        id: 'message-1',
        threadId: 'customer-1-manager-1',
        requestId: 'request-1',
        senderId: 'customer-1',
        text: '第一局',
        createdAt: '2026-07-30T10:07:00.000Z',
      },
      {
        id: 'message-2',
        threadId: 'customer-1-manager-1',
        requestId: 'request-2',
        senderId: 'manager-1',
        text: '第二局',
        createdAt: '2026-07-30T10:08:00.000Z',
      },
    ],
    now: NOW,
  });

  assert.equal(dashboard.flows.find((flow) => flow.requestId === 'request-1')?.health, 'healthy');
  assert.equal(dashboard.conversations.length, 2);
  assert.deepEqual(
    new Set(dashboard.conversations.map((conversation) => conversation.requestId)),
    new Set(['request-1', 'request-2']),
  );
  assert.equal(dashboard.overview.pendingReports, 1);
  assert.equal(dashboard.overview.escorts, 1);
  assert.equal(dashboard.conversations.every(
    (conversation) => !conversation.lastPreview.includes('第一局')
      && !conversation.lastPreview.includes('第二局'),
  ), true);
});

test('流程診斷：正常到期、舊確認見面或幹部已拒絕的聊天室不應誤報故障', () => {
  const base = {
    creatorId: 'customer-1',
    status: 'closed',
    createdAt: '2026-07-29T10:00:00.000Z',
    expiresAt: '2026-07-29T18:00:00.000Z',
  };
  const dashboard = buildAdminDashboard({
    accounts: [account('0912000001', 'customer-1', '客戶一')],
    reports: [],
    requests: [
      { ...base, id: 'expired-request' },
      { ...base, id: 'confirmed-request' },
      { ...base, id: 'declined-request' },
    ],
    responses: [
      {
        id: 'expired-response',
        requestId: 'expired-request',
        responseStatus: 'joining',
        createdAt: '2026-07-29T10:05:00.000Z',
      },
      {
        id: 'confirmed-response',
        requestId: 'confirmed-request',
        responseStatus: 'joining',
        createdAt: '2026-07-29T10:05:00.000Z',
      },
      {
        id: 'declined-response',
        requestId: 'declined-request',
        responseStatus: 'declined',
        createdAt: '2026-07-29T10:05:00.000Z',
      },
    ],
    invitations: [
      {
        id: 'expired-invitation',
        requestId: 'expired-request',
        status: 'accepted',
        chatExpiresAt: '2026-07-30T11:00:00.000Z',
        createdAt: '2026-07-29T10:06:00.000Z',
      },
      {
        id: 'confirmed-invitation',
        requestId: 'confirmed-request',
        status: 'accepted',
        meetupConfirmed: true,
        chatExpiresAt: FUTURE,
        createdAt: '2026-07-29T10:06:00.000Z',
      },
      {
        id: 'declined-invitation',
        requestId: 'declined-request',
        status: 'accepted',
        managerDecision: 'declined',
        chatExpiresAt: FUTURE,
        createdAt: '2026-07-29T10:06:00.000Z',
      },
    ],
    chatMessages: [],
    now: NOW,
  });

  assert.equal(dashboard.overview.brokenFlows, 0);
  assert.equal(dashboard.flows.every((flow) => flow.health === 'healthy'), true);
});

test('A000 稽核：同時追加的操作都必須保留', { skip }, async () => {
  const suffix = crypto.randomUUID();
  await Promise.all([
    recordAdminAudit({
      adminUserId: 'u-016',
      action: 'concurrent-a',
      target: `target-a-${suffix}`,
    }),
    recordAdminAudit({
      adminUserId: 'u-016',
      action: 'concurrent-b',
      target: `target-b-${suffix}`,
    }),
  ]);
  const records = await listAdminAudit(200);
  const targets = new Set(records.map((record) => record.target));
  assert.equal(targets.has(`target-a-${suffix}`), true);
  assert.equal(targets.has(`target-b-${suffix}`), true);
});

test('A000 權限：未登入 401；一般幹部即使偽造 JWT role=admin 仍 403；A000 可讀', { skip }, async () => {
  await store.clearShared();
  const noSession = await GET(new Request('http://localhost/api/admin'));
  assert.equal(noSession.status, 401);

  const manager = await authStore.getAccount('A001');
  assert.ok(manager);
  const forged = await adminRequest('GET', undefined, {
    userId: manager.userId,
    role: 'admin',
    tier: 'admin',
  });
  assert.equal(forged.status, 403);

  const allowed = await adminRequest();
  assert.equal(allowed.status, 200);
  assert.equal(Array.isArray(allowed.body.accounts), true);
  assert.equal(allowed.body.accounts.some((item) => 'hash' in item || 'salt' in item), false);
  assert.equal(allowed.body.dashboard.overview.accounts >= 1, true);
});

test('危險操作：只有前端確認不夠，API 確認文字錯誤必須 400 且資料保留', { skip }, async () => {
  await store.clearShared();
  await store.mergeShared({
    requests: [{
      id: 'keep-request',
      creatorId: 'customer-keep',
      status: 'open',
      createdAt: RECENT, // 須在 8 小時保留期內，否則會被清除而非「因確認文字錯誤而保留」
    }],
  });

  const rejected = await adminRequest('POST', {
    action: 'clear-shared',
    confirmation: 'wrong',
  });
  assert.equal(rejected.status, 400);
  assert.equal((await store.getCollection('requests')).some((item) => item.id === 'keep-request'), true);
});

test('聊天室內容按需載入，並以 requestId 精確隔離', { skip }, async () => {
  await store.clearShared();
  await store.mergeShared({
    chatMessages: [
      {
        id: 'chat-one',
        threadId: 'same-thread',
        requestId: 'request-one',
        senderId: 'u-016',
        text: '第一局訊息',
        createdAt: RECENT, // 須在 48 小時聊天保留期內，否則訊息會被清除而讀不到
      },
      {
        id: 'chat-two',
        threadId: 'same-thread',
        requestId: 'request-two',
        senderId: 'u-016',
        text: '第二局訊息',
        createdAt: RECENT_LATER,
      },
    ],
  });

  const summary = await adminRequest();
  assert.equal(summary.status, 200);
  assert.equal('messages' in summary.body.dashboard.conversations[0], false);

  const detail = await adminRequest(
    'GET',
    undefined,
    { userId: 'u-016', role: 'admin', tier: 'admin' },
    '?threadId=same-thread&requestId=request-one',
  );
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.messages.map((message) => message.id), ['chat-one']);
});

test('A000 可為指定既有幹部產生只顯示一次的個人啟用碼', { skip }, async () => {
  const manager = await authStore.getAccount('A003');
  assert.ok(manager);

  const response = await adminRequest('POST', {
    action: 'regenerate-manager-activation',
    account: manager.userId,
  });
  assert.equal(response.status, 200);
  assert.equal(response.body?.account, 'A003');
  assert.ok(String(response.body?.activationCode).length >= 10);

  const stored = await authStore.getAccount('A003');
  assert.ok(stored?.activationHash);
  assert.equal(JSON.stringify(stored).includes(response.body.activationCode), false);
});
