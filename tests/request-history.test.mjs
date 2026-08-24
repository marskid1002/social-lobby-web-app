// A000 歷史局封存：結案立即留快照、清理前先封存，且不保存聊天內容。
// 執行：node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/request-history.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const store = await import('@/lib/sync-store');
const historyStore = await import('@/lib/request-history-store');
const authStore = await import('@/lib/auth-store');
const { signSession } = await import('@/lib/session');
const { GET: adminGet } = await import('@/app/api/admin/route');

const REDIS = Boolean(
  process.env.KV_REST_API_URL
  || process.env.KV_URL
  || process.env.UPSTASH_REDIS_REST_URL
  || process.env.REDIS_URL
);
const skip = REDIS ? '偵測到 Redis 環境變數：跳過整合測試以免碰 production' : false;

async function reset() {
  await store.clearShared();
  await historyStore.clearRequestHistory();
}

async function a000Request() {
  const account = await authStore.getAccount('A000');
  assert.ok(account);
  const token = await signSession({
    userId: account.userId,
    role: 'admin',
    tier: account.tier,
    sessionVersion: account.sessionVersion,
  });
  return adminGet(new Request('http://localhost/api/admin', {
    headers: { cookie: `sl_session=${encodeURIComponent(token)}` },
  }));
}

test('已關閉的局立即封存，但原始資料仍在 8 小時保留期內', { skip }, async () => {
  await reset();
  const now = new Date();
  await store.mergeShared({
    requests: [{
      id: 'history-closed',
      creatorId: 'customer-history',
      area: '信義區',
      note: '歷史測試局',
      status: 'closed',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    }],
  });

  await store.getShared();
  assert.equal((await store.getCollection('requests')).some((item) => item.id === 'history-closed'), true);
  const record = (await historyStore.listRequestHistory()).find((item) => item.id === 'history-closed');
  assert.equal(record?.result, 'completed');
  assert.equal(record?.note, '歷史測試局');
});

test('過期資料清理前先封存參與結果，且歷史快照不含聊天文字或圖片網址', { skip }, async () => {
  await reset();
  const old = new Date(Date.now() - 9 * 60 * 60_000).toISOString();
  await store.mergeShared({
    requests: [{
      id: 'history-expired',
      creatorId: 'customer-expired',
      area: '中山區',
      note: '已過期測試局',
      status: 'open',
      createdAt: old,
      expiresAt: old,
    }],
    escorts: [{ id: 'escort-history', managerId: 'manager-history', nickname: '小歷', createdAt: old }],
    registeredUsers: [
      { id: 'customer-expired', nickname: '歷史客戶' },
      { id: 'manager-history', nickname: '歷史幹部' },
    ],
    responses: [{
      id: 'response-history',
      requestId: 'history-expired',
      userId: 'escort-history',
      dispatcherId: 'manager-history',
      responseStatus: 'interested',
      createdAt: old,
    }],
    chatMessages: [{
      id: 'message-history',
      threadId: 'thread-history',
      requestId: 'history-expired',
      senderId: 'manager-history',
      text: '不可進入歷史的秘密聊天內容',
      imageUrl: 'https://example.com/private-photo.jpg',
      createdAt: old,
    }],
  });

  await store.getShared();
  assert.equal((await store.getCollection('requests')).some((item) => item.id === 'history-expired'), false);
  const record = (await historyStore.listRequestHistory()).find((item) => item.id === 'history-expired');
  assert.equal(record?.creatorName, '歷史客戶');
  assert.equal(record?.participants[0].userName, '小歷');
  assert.equal(record?.participants[0].dispatcherName, '歷史幹部');
  assert.equal(record?.messageCount, 1);
  assert.equal(JSON.stringify(record).includes('不可進入歷史的秘密聊天內容'), false);
  assert.equal(JSON.stringify(record).includes('private-photo.jpg'), false);
});

test('A000 管理 API 可讀歷史局；未登入仍不可讀', { skip }, async () => {
  const unauthorized = await adminGet(new Request('http://localhost/api/admin'));
  assert.equal(unauthorized.status, 401);

  const allowed = await a000Request();
  assert.equal(allowed.status, 200);
  assert.equal(Array.isArray(allowed.body.requestHistory), true);
  assert.equal(allowed.body.requestHistory.some((item) => item.id === 'history-expired'), true);
});
