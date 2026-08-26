// 新增小姐後立即派工的整合測試：兩個動作都必須先由 server 落盤才回成功。
// 執行：node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/escort-dispatch.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const { POST: createEscort } = await import('@/app/api/escorts/route');
const { POST: dispatchEscorts } = await import('@/app/api/dispatch/route');
const { signSession } = await import('@/lib/session');
const store = await import('@/lib/sync-store');
const authStore = await import('@/lib/auth-store');

const REDIS = Boolean(
  process.env.KV_REST_API_URL
  || process.env.KV_URL
  || process.env.UPSTASH_REDIS_REST_URL
  || process.env.REDIS_URL
);
const skip = REDIS ? '偵測到 Redis 環境變數：跳過整合測試以免碰 production' : false;

async function post(route, account, body) {
  const token = await signSession({
    userId: account.userId,
    role: 'manager',
    tier: account.tier,
    sessionVersion: account.sessionVersion,
  });
  return route(new Request('http://localhost/api/test', {
    method: 'POST',
    headers: {
      cookie: `sl_session=${encodeURIComponent(token)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  }));
}

test('新增小姐成功回應後，不經背景同步也能立即派工', { skip }, async () => {
  await store.clearShared();
  const manager = (await authStore.createManagerAccount(`立即派工-${Date.now()}`)).account;
  const created = await post(createEscort, manager, { nickname: '立即建立小姐' });
  assert.equal(created.status, 201);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.escort.managerId, manager.userId);
  assert.ok(created.body.escorts.some((escort) => escort.id === created.body.escort.id));

  const requestId = `req-immediate-${Date.now()}`;
  await store.mergeShared({
    requests: [{
      id: requestId,
      creatorId: 'customer-immediate',
      status: 'open',
      peopleCount: 1,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    }],
  });

  const dispatched = await post(dispatchEscorts, manager, {
    requestId,
    escortIds: [created.body.escort.id],
  });
  assert.equal(dispatched.status, 200);
  assert.equal(dispatched.body.ok, true);
  assert.equal(dispatched.body.responses[0].userId, created.body.escort.id);
  assert.equal(dispatched.body.responses[0].dispatcherId, manager.userId);
  assert.equal(dispatched.body.responses[0].dispatchOnline, false);
  assert.equal(dispatched.body.updates[0].userId, 'customer-immediate');

  const storedResponse = (await store.getCollection('responses'))
    .find((response) => response.id === dispatched.body.responses[0].id);
  assert.equal(storedResponse?.responseStatus, 'interested');

  const duplicate = await post(dispatchEscorts, manager, {
    requestId,
    escortIds: [created.body.escort.id],
  });
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.body.error, /已經安排過/);
  assert.equal((await store.getCollection('responses')).length, 1);
});

test('派工會保存當下在線狀態快照', { skip }, async () => {
  await store.clearShared();
  const manager = (await authStore.createManagerAccount(`在線快照-${Date.now()}`)).account;
  const created = await post(createEscort, manager, { nickname: '在線快照人員' });
  const escortId = created.body.escort.id;
  const requestId = `req-presence-${Date.now()}`;
  const updatedAt = new Date(Date.now() - 30_000).toISOString();
  await store.mergeShared({
    requests: [{ id: requestId, creatorId: 'customer-presence', status: 'open', peopleCount: 1, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() }],
    presence: [{ id: escortId, online: true, updatedAt }],
  });

  const dispatched = await post(dispatchEscorts, manager, { requestId, escortIds: [escortId] });
  assert.equal(dispatched.status, 200);
  assert.equal(dispatched.body.responses[0].dispatchOnline, true);
  assert.equal(dispatched.body.responses[0].dispatchPresenceUpdatedAt, updatedAt);
});

test('伺服器找不到小姐時明確拒絕，不會回傳假成功或寫入派工', { skip }, async () => {
  await store.clearShared();
  const manager = (await authStore.createManagerAccount(`拒絕假派工-${Date.now()}`)).account;
  const requestId = `req-reject-${Date.now()}`;
  await store.mergeShared({
    requests: [{
      id: requestId,
      creatorId: 'customer-reject',
      status: 'open',
      peopleCount: 1,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    }],
  });

  const response = await post(dispatchEscorts, manager, {
    requestId,
    escortIds: ['esc-not-on-server'],
  });
  assert.equal(response.status, 409);
  assert.match(response.body.error, /尚未在伺服器建立完成/);
  assert.equal((await store.getCollection('responses')).length, 0);
  assert.equal((await store.getCollection('updates')).length, 0);
});
