// 密碼複雜度規則測試：載入「真正的」production passwordRuleError 與 /api/auth POST（reject 接線）。
// 不連真實 Redis（沙盒清空 Redis env → 記憶體 fallback）。只驗 reject 路徑（避開 withSession，
// 因測試用 next/server stub 的 NextResponse 無 headers.set）。
//
// 執行：node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/password-rule.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const route = await import('@/app/api/auth/route');
const { passwordRuleError } = route;

// ── 純規則（大小寫+數字+符號、最短 6、上限 128）────────────────────────────────

test('合法密碼（含符號+大小寫+數字，≥6）→ null', () => {
  assert.equal(passwordRuleError('@Best123'), null); // 使用者指定的驗證碼本身也符合
  assert.equal(passwordRuleError('Aa1!aa'), null);   // 剛好 6 碼
});

test('缺任一類別 → 回錯誤訊息', () => {
  assert.ok(passwordRuleError('abc123'));   // 無大寫、無符號
  assert.ok(passwordRuleError('ABC123'));   // 無小寫、無符號
  assert.ok(passwordRuleError('Abcdef'));   // 無數字、無符號
  assert.ok(passwordRuleError('Abc123'));   // 無符號
  assert.ok(passwordRuleError('Abc!ef'));   // 無數字
  assert.ok(passwordRuleError('abc!23'));   // 無大寫
  assert.ok(passwordRuleError('ABC!23'));   // 無小寫
});

test('長度邊界：<6 或 >128 → 錯誤；符號類別各自訊息', () => {
  assert.ok(passwordRuleError('Aa1!a'));                 // 5 碼 → 長度不足
  assert.ok(passwordRuleError('A'.repeat(60) + 'a1!'.repeat(30))); // >128
  assert.equal(passwordRuleError('aaaaaa'), '密碼需包含大寫英文字母');
  assert.equal(passwordRuleError('Aaaaaa'), '密碼需包含數字');
  assert.equal(passwordRuleError('Aaaaa1'), '密碼需包含符號');
});

// ── Route reject 接線（不進 withSession）─────────────────────────────────────

const ENV_KEYS = ['NODE_ENV', 'VERCEL_ENV', 'VERCEL', 'MANAGER_ACTIVATION_CODE', 'SESSION_SECRET',
  'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'REDIS_URL', 'KV_URL'];
const REDIS = !!(process.env.KV_REST_API_URL || process.env.KV_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL);
const skip = REDIS ? '偵測到 Redis 環境變數：跳過 route 測試以免污染' : false;
function snapshotEnv() { const s = {}; for (const k of ENV_KEYS) s[k] = process.env[k]; return s; }
function restoreEnv(s) { for (const k of ENV_KEYS) { if (s[k] === undefined) delete process.env[k]; else process.env[k] = s[k]; } }
async function sandbox(fn) {
  const snap = snapshotEnv();
  for (const k of ENV_KEYS) delete process.env[k]; // dev、無 Redis、無啟用碼、非 Vercel
  try { return await fn(); } finally { restoreEnv(snap); }
}
let seq = 900000000;
function authPost(body) {
  return new Request('http://localhost/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.' + (seq % 200) },
    body: JSON.stringify(body),
  });
}

test('register：弱密碼 → 400（複雜度接線，且在 OTP 之前）', { skip }, async () => {
  await sandbox(async () => {
    const res = await route.POST(authPost({ action: 'register', phone: '09' + (seq++), password: 'weak', nickname: 'x', code: '000000' }));
    assert.equal(res.status, 400);
    assert.ok(String(res.body?.error || '').includes('密碼'), '應回密碼複雜度錯誤');
  });
});

test('register：複雜密碼通過複雜度、續往 OTP（OTP 錯 → 400 但非密碼錯）', { skip }, async () => {
  await sandbox(async () => {
    const res = await route.POST(authPost({ action: 'register', phone: '09' + (seq++), password: '@Best123', nickname: 'x', code: '000000' }));
    assert.equal(res.status, 400);
    assert.ok(String(res.body?.error || '').includes('驗證碼'), '複雜度已通過，錯在 OTP');
  });
});

test('manager 首次登入：弱密碼 → 400（首次設密接線）', { skip }, async () => {
  await sandbox(async () => {
    // 本地 dev：MANAGER_ACTIVATION_CODE 未設、非 prod、非 Vercel → 跳過啟用碼，直接走密碼規則
    const res = await route.POST(authPost({ action: 'login', account: 'A012', password: 'weak' }));
    assert.equal(res.status, 400);
    assert.ok(String(res.body?.error || '').includes('密碼'), '應回首次設密的複雜度錯誤');
  });
});
