// A000 幹部帳號生命週期測試。
// 執行：
// node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/manager-lifecycle.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const authStore = await import('@/lib/auth-store');
const { signSession } = await import('@/lib/session');
const { requireActiveSession } = await import('@/lib/active-session');

const REDIS = Boolean(
  process.env.KV_REST_API_URL
  || process.env.KV_URL
  || process.env.UPSTASH_REDIS_REST_URL
  || process.env.REDIS_URL
);
const skip = REDIS ? '偵測到 Redis 環境變數：跳過以免碰 production' : false;

test('新增幹部：唯一 Axxx、啟用碼只回傳一次且帳號只保存雜湊', { skip }, async () => {
  const created = await authStore.createManagerAccount('生命週期測試幹部');
  assert.match(created.account.key, /^A\d{3,4}$/);
  assert.match(created.account.userId, /^m-/);
  assert.ok(created.activationCode.length >= 10);
  assert.notEqual(created.account.activationHash, created.activationCode);
  assert.equal(JSON.stringify(created.account).includes(created.activationCode), false);

  assert.equal(
    await authStore.activateManagerWithCode(created.account.key, 'wrong-code', 'Strong!Pass8'),
    null,
  );
  const activated = await authStore.activateManagerWithCode(
    created.account.key,
    created.activationCode,
    'Strong!Pass8',
  );
  assert.ok(activated?.hash);
  assert.equal(activated?.activationHash, undefined);
  assert.equal(
    await authStore.activateManagerWithCode(created.account.key, created.activationCode, 'Other!Pass9'),
    null,
  );
});

test('重發啟用碼撤銷舊登入；登出所有裝置用 sessionVersion 讓舊 JWT 失效', { skip }, async () => {
  const created = await authStore.createManagerAccount('裝置失效測試幹部');
  const firstCode = created.activationCode;
  const secondCode = await authStore.regenerateManagerActivation(created.account.key);
  assert.ok(secondCode);
  assert.notEqual(firstCode, secondCode);
  assert.equal(
    await authStore.activateManagerWithCode(created.account.key, firstCode, 'Strong!Pass8'),
    null,
  );
  const activated = await authStore.activateManagerWithCode(
    created.account.key,
    secondCode,
    'Strong!Pass8',
  );
  assert.ok(activated);

  const token = await signSession({
    userId: activated.userId,
    role: 'manager',
    tier: activated.tier,
    sessionVersion: activated.sessionVersion,
  });
  await authStore.bumpAccountSessionVersion(created.account.key);
  const result = await requireActiveSession(new Request('http://localhost/api/test', {
    headers: { cookie: `sl_session=${encodeURIComponent(token)}` },
  }));
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
});

test('只有未啟用幹部可由儲存層永久刪除', { skip }, async () => {
  const created = await authStore.createManagerAccount('可刪除測試幹部');
  const removed = await authStore.deleteUnactivatedManager(created.account.key);
  assert.equal(removed?.userId, created.account.userId);
  assert.equal(await authStore.getAccount(created.account.key), null);
});
