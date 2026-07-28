// B route 整合測試：實際呼叫 /api/sync POST（經 requireActiveSession + authorizeWrites + mergeShared），
// 驗證「未授權項不進 server store、合法項寫入、合法派工→接受→代談流程可同步」。
// 僅用記憶體 fallback（無 Redis env 才跑）；不碰 production Redis。
//
// 執行：node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/sync-route.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const { POST } = await import('@/app/api/sync/route');
const { signSession } = await import('@/lib/session');
const store = await import('@/lib/sync-store');
const authStore = await import('@/lib/auth-store');

const REDIS = !!(process.env.KV_REST_API_URL || process.env.KV_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL);
const skip = REDIS ? '偵測到 Redis 環境變數：跳過 route 整合測試以免碰 production' : false;
const CA = '2026-01-01T00:00:00.000Z';
const mgr = (id) => ({ userId: id, role: 'manager', tier: 'vip' });
const cust = (id) => ({ userId: id, role: 'user', tier: 'standard' });

async function post(session, patch) {
  const token = await signSession(session);
  const req = new Request('http://localhost/api/sync', {
    method: 'POST',
    headers: { cookie: `sl_session=${encodeURIComponent(token)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ patch }),
  });
  return POST(req);
}
const col = (k) => store.getCollection(k);
const byId = (arr, id) => arr.find((x) => x.id === id);

test('route：escort takeover 經 POST 不寫入（server 維持原 owner）', { skip }, async () => {
  await store.clearShared();
  await store.mergeShared({ escorts: [{ id: 'esc-A', managerId: 'u-501', nickname: '小美', createdAt: CA }] });
  const res = await post(mgr('u-502'), { escorts: [{ id: 'esc-A', managerId: 'u-502', nickname: 'takeover' }] });
  assert.equal(res.status, 200);
  const e = byId(await col('escorts'), 'esc-A');
  assert.equal(e.managerId, 'u-501'); assert.equal(e.nickname, '小美'); // 未被覆寫
});

test('route：合法與非法混合 patch，只有合法項進 mergeShared', { skip }, async () => {
  await store.clearShared();
  await store.mergeShared({ escorts: [{ id: 'esc-A', managerId: 'u-501', nickname: 'a', createdAt: CA }] });
  await post(mgr('u-502'), { escorts: [
    { id: 'esc-A', managerId: 'u-502', nickname: 'hack' },          // takeover → 丟棄
    { id: 'esc-B', managerId: 'u-502', nickname: 'legit', createdAt: CA }, // 合法新建 → 寫入
  ] });
  const escs = await col('escorts');
  assert.equal(byId(escs, 'esc-A').managerId, 'u-501');
  assert.ok(byId(escs, 'esc-B'));
});

test('route：偽造 accepted invitation 未寫入', { skip }, async () => {
  const c = (await authStore.createCustomer('0966000001', 'Pw!23456', 'c')).userId;
  await store.clearShared();
  await store.mergeShared({ requests: [{ id: 'r1', creatorId: c, createdAt: CA }] });
  await post(cust(c), { invitations: [{ id: 'iv', fromUserId: 'stranger', toUserId: c, requestId: 'r1', status: 'accepted', createdAt: CA }] });
  assert.equal((await col('invitations')).length, 0);
});

test('route：偽造 owner 的 post 未寫入（server 維持原作者/內容）', { skip }, async () => {
  const c = (await authStore.createCustomer('0966000003', 'Pw!23456', 'c')).userId;
  await store.clearShared();
  await store.mergeShared({ momentPosts: [{ id: 'p1', authorId: 'victim', content: 'v', likeCount: 0 }] });
  await post(cust(c), { momentPosts: [{ id: 'p1', authorId: c, content: 'hack' }] });
  const p = byId(await col('momentPosts'), 'p1');
  assert.equal(p.authorId, 'victim'); assert.equal(p.content, 'v');
});

test('route：任意 recipient 的 update 未寫入', { skip }, async () => {
  const c = (await authStore.createCustomer('0966000004', 'Pw!23456', 'c')).userId;
  await store.clearShared();
  await store.mergeShared({ requests: [{ id: 'r1', creatorId: c, createdAt: CA }] });
  await post(cust(c), { updates: [{ id: 'u1', actorId: c, userId: 'victim', eventType: 'response_received', refRequestId: 'r1' }] });
  assert.equal((await col('updates')).length, 0); // 收件人非該局 creator
});

test('route：惡意 responseStatus=joining（首次加入）不寫入 joining', { skip }, async () => {
  const c = (await authStore.createCustomer('0966000006', 'Pw!23456', 'c')).userId;
  await store.clearShared();
  await store.mergeShared({ requests: [{ id: 'r1', creatorId: 'other', createdAt: CA }] });
  await post(cust(c), { responses: [{ id: 'x1', requestId: 'r1', userId: c, responseStatus: 'joining', createdAt: CA }] });
  const r = byId(await col('responses'), 'x1');
  assert.ok(r); assert.equal(r.responseStatus, 'interested'); // server 強制 interested，跳過接受被擋
});

test('route：假通知（沒有 response 的 response_received / 尚未接受的 invite_accepted）不寫入', { skip }, async () => {
  const c = (await authStore.createCustomer('0966000007', 'Pw!23456', 'c')).userId;
  await store.clearShared();
  await store.mergeShared({ requests: [{ id: 'r1', creatorId: c, createdAt: CA }] });
  // 沒有 response 卻發 response_received → 丟棄
  await post(cust(c), { updates: [{ id: 'fake1', actorId: c, userId: c, eventType: 'response_received', refRequestId: 'r1' }] });
  assert.equal((await col('updates')).length, 0);
  // 只有 pending invitation 卻發 invite_accepted → 丟棄（且 pending 邀請由 sender 送出、狀態維持 pending）
  await store.clearShared();
  await post(cust(c), {
    invitations: [{ id: 'ivp', fromUserId: c, toUserId: 'someone', requestId: null, createdAt: CA }],
    updates: [{ id: 'fake2', actorId: 'someone', userId: c, eventType: 'invite_accepted' }],
  });
  assert.equal((await col('updates')).length, 0);
});

test('route：合法派工→接受→代談 可透過實際 POST 同步', { skip }, async () => {
  const c = (await authStore.createCustomer('0966000005', 'Pw!23456', 'c')).userId;
  await store.clearShared();
  await store.mergeShared({ requests: [{ id: 'r1', creatorId: c, createdAt: CA }], escorts: [{ id: 'girlA', managerId: 'u-501', nickname: 'a', createdAt: CA }] });

  // 幹部 u-501 派工 girlA（含通知）
  await post(mgr('u-501'), {
    responses: [{ id: 'd1', requestId: 'r1', userId: 'girlA', dispatcherId: 'u-501', responseStatus: 'interested', createdAt: CA }],
    updates: [{ id: 'ud', actorId: 'girlA', userId: c, eventType: 'response_received', refRequestId: 'r1' }],
  });
  assert.ok(byId(await col('responses'), 'd1'));
  assert.ok(byId(await col('updates'), 'ud')); // delegation 通知合法

  // 客戶 c 接受 → response 轉 joining + 建立 accepted 代談邀請 + 通知幹部
  await post(cust(c), {
    responses: [{ id: 'd1', responseStatus: 'joining' }],
    invitations: [{ id: 'iv', fromUserId: 'u-501', toUserId: c, requestId: 'r1', dispatcherId: 'u-501', status: 'accepted', respondedAt: CA, chatExpiresAt: CA, createdAt: CA }],
    updates: [{ id: 'ua', actorId: c, userId: 'u-501', eventType: 'invite_accepted', refRequestId: 'r1' }],
  });
  assert.equal(byId(await col('responses'), 'd1').responseStatus, 'joining');
  const iv = byId(await col('invitations'), 'iv');
  assert.ok(iv && iv.status === 'accepted' && iv.fromUserId === 'u-501' && iv.dispatcherId === 'u-501');
  assert.ok(byId(await col('updates'), 'ua'));
});
