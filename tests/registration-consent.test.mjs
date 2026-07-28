// 註冊條款同意測試：直接載入 production legal validator、auth route 與 auth store。
// 不連真實 Redis；若偵測到 Redis env，會跳過 route/store 測試以免污染。
//
// 執行：node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/registration-consent.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const legal = await import('@/lib/legal');
const route = await import('@/app/api/auth/route');
const authStore = await import('@/lib/auth-store');

const { registrationConsentError, TERMS_SECTIONS, TERMS_VERSION } = legal;

test('平台規範版本與 13 章內容固定存在', () => {
  assert.equal(TERMS_VERSION, '1.0');
  assert.equal(TERMS_SECTIONS.length, 13);
  assert.equal(TERMS_SECTIONS[0].title, '第一章　平台宗旨');
  assert.equal(TERMS_SECTIONS[12].title, '第十三章　條款修改');
});

test('註冊同意只接受：年滿 18 歲、明確同意、目前版本', () => {
  assert.equal(registrationConsentError({
    ageConfirmed: true,
    termsAccepted: true,
    termsVersion: TERMS_VERSION,
  }), null);

  assert.match(registrationConsentError({ termsAccepted: true, termsVersion: TERMS_VERSION }), /18/);
  assert.match(registrationConsentError({ ageConfirmed: true, termsVersion: TERMS_VERSION }), /同意/);
  assert.match(registrationConsentError({
    ageConfirmed: true,
    termsAccepted: true,
    termsVersion: '0.9',
  }), /版本/);
  assert.ok(registrationConsentError({
    ageConfirmed: 'true',
    termsAccepted: 'true',
    termsVersion: TERMS_VERSION,
  }));
});

const ENV_KEYS = [
  'NODE_ENV', 'VERCEL_ENV', 'VERCEL', 'SESSION_SECRET',
  'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN', 'REDIS_URL', 'KV_URL',
];
const REDIS = Boolean(
  process.env.KV_REST_API_URL
  || process.env.KV_URL
  || process.env.UPSTASH_REDIS_REST_URL
  || process.env.REDIS_URL
);
const skip = REDIS ? '偵測到 Redis 環境變數：跳過 route/store 測試以免污染' : false;

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

async function sandbox(fn) {
  const snapshot = snapshotEnv();
  for (const key of ENV_KEYS) delete process.env[key];
  try {
    return await fn();
  } finally {
    restoreEnv(snapshot);
  }
}

let seq = 970000000;
function authPost(body) {
  return new Request('http://localhost/api/auth', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `203.0.113.${seq % 200}`,
    },
    body: JSON.stringify(body),
  });
}

function registerBody(overrides = {}) {
  return {
    action: 'register',
    phone: `09${seq++}`,
    password: '@Best123',
    nickname: '條款測試',
    code: '000000',
    ageConfirmed: true,
    termsAccepted: true,
    termsVersion: TERMS_VERSION,
    ...overrides,
  };
}

test('register：未同意或版本錯誤會在帳號與 OTP 處理前回 400', { skip }, async () => {
  await sandbox(async () => {
    const missing = await route.POST(authPost(registerBody({
      ageConfirmed: false,
      termsAccepted: false,
      termsVersion: undefined,
    })));
    assert.equal(missing.status, 400);
    assert.match(String(missing.body?.error), /18/);

    const stale = await route.POST(authPost(registerBody({ termsVersion: '0.9' })));
    assert.equal(stale.status, 400);
    assert.match(String(stale.body?.error), /版本/);
  });
});

test('register：合法同意資料可通過條款閘門，繼續驗證 OTP', { skip }, async () => {
  await sandbox(async () => {
    const res = await route.POST(authPost(registerBody()));
    assert.equal(res.status, 400);
    assert.match(String(res.body?.error), /驗證碼/);
  });
});

test('帳號儲存層會保存 server 提供的條款版本與同意時間', { skip }, async () => {
  await sandbox(async () => {
    const phone = `09${seq++}`;
    const acceptedAt = '2026-07-28T00:00:00.000Z';
    const created = await authStore.createCustomer(phone, '@Best123', '條款紀錄', {
      termsVersion: TERMS_VERSION,
      acceptedAt,
    });
    const stored = await authStore.getAccount(phone);

    assert.equal(stored?.userId, created.userId);
    assert.equal(stored?.termsVersion, TERMS_VERSION);
    assert.equal(stored?.termsAcceptedAt, acceptedAt);
    assert.equal(stored?.ageConfirmedAt, acceptedAt);

    await authStore.deleteAccount(phone);
  });
});
