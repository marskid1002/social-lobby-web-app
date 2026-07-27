// 幹部啟用碼分流測試：測試幹部(A011~A020) 用 MANAGER_TEST_ACTIVATION_CODE、
// 正式幹部(A001~A010) 用 MANAGER_ACTIVATION_CODE，兩者互不接受對方的碼。
// 載入真正的 production isTestManagerKey 與 /api/auth POST；只驗 reject 路徑（避開 withSession）。不連真實 Redis。
//
// 執行：node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/manager-activation.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const route = await import('@/app/api/auth/route');
const authStore = await import('@/lib/auth-store');

// ── isTestManagerKey 邊界 ─────────────────────────────────────────────────────
test('isTestManagerKey：A011~A020 為 true，其餘為 false', () => {
  for (const k of ['A011', 'A012', 'A015', 'A019', 'A020', 'a012']) assert.equal(authStore.isTestManagerKey(k), true, k);
  for (const k of ['A001', 'A010', 'A021', 'A000', 'A100', '0912345678', '']) assert.equal(authStore.isTestManagerKey(k), false, k);
});

// ── Route：啟用碼分流（皆為 reject 路徑）────────────────────────────────────────
const ENV_KEYS = ['NODE_ENV', 'VERCEL_ENV', 'VERCEL', 'MANAGER_ACTIVATION_CODE', 'MANAGER_TEST_ACTIVATION_CODE',
  'SESSION_SECRET', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'REDIS_URL', 'KV_URL'];
const REDIS = !!(process.env.KV_REST_API_URL || process.env.KV_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL);
const skip = REDIS ? '偵測到 Redis 環境變數：跳過 route 測試以免污染' : false;
function snapshotEnv() { const s = {}; for (const k of ENV_KEYS) s[k] = process.env[k]; return s; }
function restoreEnv(s) { for (const k of ENV_KEYS) { if (s[k] === undefined) delete process.env[k]; else process.env[k] = s[k]; } }
let ipSeq = 0;
async function loginPost(overrides, body) {
  const snap = snapshotEnv();
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(overrides)) if (v !== undefined) process.env[k] = v;
  try {
    const req = new Request('http://localhost/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.' + (ipSeq++ % 250) },
      body: JSON.stringify({ action: 'login', ...body }),
    });
    const res = await route.POST(req);
    return res;
  } finally { restoreEnv(snap); }
}

const REAL = 'RealCode!1';
const TEST = '@Best123';

test('測試幹部 A012：錯誤測試碼 → 403 needActivation，正確測試碼 → 過啟用進到密碼規則(400)', { skip }, async () => {
  const wrong = await loginPost({ MANAGER_TEST_ACTIVATION_CODE: TEST, MANAGER_ACTIVATION_CODE: REAL },
    { account: 'A012', password: '@Best123', activationCode: 'nope' });
  assert.equal(wrong.status, 403); assert.equal(wrong.body?.needActivation, true);

  // 正確測試碼 + 弱密碼 → 已過啟用碼、卡在密碼複雜度(400)，證明測試碼被接受
  const ok = await loginPost({ MANAGER_TEST_ACTIVATION_CODE: TEST, MANAGER_ACTIVATION_CODE: REAL },
    { account: 'A013', password: 'weak', activationCode: TEST });
  assert.equal(ok.status, 400);
  assert.ok(String(ok.body?.error || '').includes('密碼'));
});

test('測試幹部 A012 不接受正式碼 MANAGER_ACTIVATION_CODE → 403', { skip }, async () => {
  const res = await loginPost({ MANAGER_TEST_ACTIVATION_CODE: TEST, MANAGER_ACTIVATION_CODE: REAL },
    { account: 'A014', password: '@Best123', activationCode: REAL }); // 用正式碼試測試帳號
  assert.equal(res.status, 403); assert.equal(res.body?.needActivation, true);
});

test('正式幹部 A001 不接受測試碼，接受正式碼後進到密碼規則(400)', { skip }, async () => {
  const wrong = await loginPost({ MANAGER_TEST_ACTIVATION_CODE: TEST, MANAGER_ACTIVATION_CODE: REAL },
    { account: 'A001', password: '@Best123', activationCode: TEST }); // 用測試碼試正式帳號
  assert.equal(wrong.status, 403); assert.equal(wrong.body?.needActivation, true);

  const ok = await loginPost({ MANAGER_TEST_ACTIVATION_CODE: TEST, MANAGER_ACTIVATION_CODE: REAL },
    { account: 'A002', password: 'weak', activationCode: REAL });
  assert.equal(ok.status, 400);
  assert.ok(String(ok.body?.error || '').includes('密碼'));
});
