// 幹部首次登入只接受 A000 為該帳號產生的個人一次性啟用碼。
// 執行：node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/manager-activation.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const route = await import('@/app/api/auth/route');
const authStore = await import('@/lib/auth-store');

const ENV_KEYS = [
  'NODE_ENV',
  'VERCEL_ENV',
  'VERCEL',
  'MANAGER_ACTIVATION_CODE',
  'MANAGER_TEST_ACTIVATION_CODE',
  'SESSION_SECRET',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'REDIS_URL',
  'KV_URL',
];
const REDIS = Boolean(
  process.env.KV_REST_API_URL
  || process.env.KV_URL
  || process.env.UPSTASH_REDIS_REST_URL
  || process.env.REDIS_URL
);
const skip = REDIS ? '本機連到 Redis，避免測試碰正式帳號資料' : false;

function snapshotEnv() {
  const snapshot = {};
  for (const key of ENV_KEYS) snapshot[key] = process.env[key];
  return snapshot;
}

function restoreEnv(snapshot) {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

let ipSequence = 0;
async function loginPost(body, env = {}) {
  const snapshot = snapshotEnv();
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.SESSION_SECRET = 'manager-activation-test-secret-at-least-32-characters';
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  try {
    const request = new Request('http://localhost/api/auth', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': `192.0.2.${++ipSequence}`,
      },
      body: JSON.stringify({ action: 'login', ...body }),
    });
    return await route.POST(request);
  } finally {
    restoreEnv(snapshot);
  }
}

test('舊共用啟用碼對既有幹部與測試幹部都完全失效', { skip }, async () => {
  const env = {
    MANAGER_ACTIVATION_CODE: 'LegacyRealCode!1',
    MANAGER_TEST_ACTIVATION_CODE: 'LegacyTestCode!1',
  };
  for (const account of ['A001', 'A012', 'A999', 'A1000']) {
    const activationCode = account === 'A001'
      ? env.MANAGER_ACTIVATION_CODE
      : env.MANAGER_TEST_ACTIVATION_CODE;
    const response = await loginPost({
      account,
      password: 'Strong!Pass8',
      activationCode,
    }, env);
    assert.equal(response.status, 403, account);
    assert.equal(response.body?.needActivation, true, account);
    assert.match(String(response.body?.error), /個人一次性啟用碼/, account);
    assert.equal((await authStore.getAccount(account))?.hash, null, account);
  }
});

test('A000 為既有幹部重發個人碼後，只有新碼可完成首次登入', { skip }, async () => {
  const personalCode = await authStore.regenerateManagerActivation('A002');
  assert.ok(personalCode);

  const legacy = await loginPost({
    account: 'A002',
    password: 'Strong!Pass8',
    activationCode: 'LegacyRealCode!1',
  }, { MANAGER_ACTIVATION_CODE: 'LegacyRealCode!1' });
  assert.equal(legacy.status, 403);

  const success = await loginPost({
    account: 'A002',
    password: 'Strong!Pass8',
    activationCode: personalCode,
  });
  assert.equal(success.status, 200);
  assert.equal((await authStore.getAccount('A002'))?.activationHash, undefined);

  const reused = await loginPost({
    account: 'A002',
    password: 'Other!Pass9',
    activationCode: personalCode,
  });
  assert.equal(reused.status, 401);
});

test('新建幹部的個人碼可用一次；重發後舊碼立即失效', { skip }, async () => {
  const created = await authStore.createManagerAccount('一次性啟用測試');
  const oldCode = created.activationCode;
  const newCode = await authStore.regenerateManagerActivation(created.account.key);
  assert.ok(newCode);
  assert.notEqual(newCode, oldCode);

  const oldAttempt = await loginPost({
    account: created.account.key,
    password: 'Strong!Pass8',
    activationCode: oldCode,
  });
  assert.equal(oldAttempt.status, 403);

  const weakAttempt = await loginPost({
    account: created.account.key,
    password: 'weak',
    activationCode: newCode,
  });
  assert.equal(weakAttempt.status, 400);

  const success = await loginPost({
    account: created.account.key,
    password: 'Strong!Pass8',
    activationCode: newCode,
  });
  assert.equal(success.status, 200);
});
