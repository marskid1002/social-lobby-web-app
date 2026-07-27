// O 測試：正式環境 SMS fail-closed + health readiness。
// 直接載入「真正的」production 程式（sms.ts、health route、auth route），不複製邏輯。
// 不呼叫真實 MsgDogs、不送真實簡訊：global.fetch 全程被 mock；不連真實 Redis。
//
// 執行方式（不需 dev server；用 Node module hook 載入 .ts，零新增套件）：
//   node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/sms-failclosed.test.mjs
//
// 環境隔離：每個測試完整快照/還原 process.env、global.fetch、console.log/console.error，避免互相污染。

import test from 'node:test';
import assert from 'node:assert/strict';

const sms = await import('@/lib/sms');

// 測試會觸碰到的環境變數（完整快照/還原）
const ENV_KEYS = [
  'NODE_ENV', 'VERCEL_ENV', 'SMS_PROVIDER',
  'MSGDOGS_MERCHANT_CODE', 'MSGDOGS_SECRET_KEY', 'MSGDOGS_MODE',
  'MSGDOGS_BASE_URL', 'MSGDOGS_PHONE_FORMAT', 'MSGDOGS_CONTENT_TYPE',
  'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
  'SESSION_SECRET', 'SL_KEY_PREFIX', 'ADMIN_SECRET',
];
function snapshotEnv() { const s = {}; for (const k of ENV_KEYS) s[k] = process.env[k]; return s; }
function restoreEnv(s) { for (const k of ENV_KEYS) { if (s[k] === undefined) delete process.env[k]; else process.env[k] = s[k]; } }

const OTP = '135790';
const PHONE = '0912345678';
const SECRET = 's3cr3t-accesskey';
const MERCHANT = 'm3rch4nt';

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

// 建立乾淨沙盒：清空相關 env → 套 overrides；mock fetch/console；跑 fn；最後完整還原。
async function withSandbox(overrides, fetchImpl, fn) {
  const snap = snapshotEnv();
  const origFetch = global.fetch, origLog = console.log, origErr = console.error;
  const logs = [], errs = [];
  let fetchCalls = 0;
  console.log = (...a) => logs.push(a.map(String).join(' '));
  console.error = (...a) => errs.push(a.map(String).join(' '));
  global.fetch = async (...args) => { fetchCalls++; return fetchImpl ? await fetchImpl(...args) : jsonResponse({ error: false, code: 200 }); };
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(overrides)) if (v !== undefined) process.env[k] = v;
  const ctx = { logs, errs, calls: () => fetchCalls, out: () => logs.concat(errs).join('\n') };
  try { return await fn(ctx); }
  finally { console.log = origLog; console.error = origErr; global.fetch = origFetch; restoreEnv(snap); }
}
function assertNoLeak(ctx) {
  const out = ctx.out();
  assert.ok(!out.includes(OTP), `log 不得含 OTP：${out}`);
  assert.ok(!out.includes(PHONE), `log 不得含手機：${out}`);
  assert.ok(!out.includes(SECRET), `log 不得含 secret：${out}`);
  assert.ok(!out.includes(MERCHANT), `log 不得含 merchant：${out}`);
}

// ── sendOtpSms（O 九.1~九.9）─────────────────────────────────────────────────

test('1) production + SMS_PROVIDER 未設定 → false、無 fetch、log 無 OTP/手機', async () => {
  await withSandbox({ NODE_ENV: 'production' }, null, async (ctx) => {
    const r = await sms.sendOtpSms(PHONE, OTP, 'register');
    assert.equal(r, false);
    assert.equal(ctx.calls(), 0);
    assertNoLeak(ctx);
  });
});

test('2) production + SMS_PROVIDER=console → false、無 fetch、無 OTP/手機', async () => {
  await withSandbox({ NODE_ENV: 'production', SMS_PROVIDER: 'console' }, null, async (ctx) => {
    const r = await sms.sendOtpSms(PHONE, OTP, 'register');
    assert.equal(r, false);
    assert.equal(ctx.calls(), 0);
    assertNoLeak(ctx);
  });
});

test('3) production + SMS_PROVIDER 未知 → false、無 fetch、無洩漏', async () => {
  await withSandbox({ NODE_ENV: 'production', SMS_PROVIDER: 'weirdprovider' }, null, async (ctx) => {
    const r = await sms.sendOtpSms(PHONE, OTP, 'register');
    assert.equal(r, false);
    assert.equal(ctx.calls(), 0);
    assertNoLeak(ctx);
  });
});

test('4) production + msgdogs 但缺 merchant → false、無 fetch', async () => {
  await withSandbox({ NODE_ENV: 'production', SMS_PROVIDER: 'msgdogs', MSGDOGS_SECRET_KEY: SECRET }, null, async (ctx) => {
    const r = await sms.sendOtpSms(PHONE, OTP, 'register');
    assert.equal(r, false);
    assert.equal(ctx.calls(), 0);
    assertNoLeak(ctx);
  });
});

test('5) production + msgdogs 但缺 secret → false、無 fetch', async () => {
  await withSandbox({ NODE_ENV: 'production', SMS_PROVIDER: 'msgdogs', MSGDOGS_MERCHANT_CODE: MERCHANT }, null, async (ctx) => {
    const r = await sms.sendOtpSms(PHONE, OTP, 'register');
    assert.equal(r, false);
    assert.equal(ctx.calls(), 0);
    assertNoLeak(ctx);
  });
});

test('6) production + msgdogs 設定完整 + fetch 成功 → true、isSmsConfigured true、log 無 OTP/手機', async () => {
  await withSandbox(
    { NODE_ENV: 'production', SMS_PROVIDER: 'msgdogs', MSGDOGS_MERCHANT_CODE: MERCHANT, MSGDOGS_SECRET_KEY: SECRET },
    async () => jsonResponse({ error: false, code: 200 }, 200),
    async (ctx) => {
      assert.equal(sms.isSmsConfigured(), true);
      const r = await sms.sendOtpSms(PHONE, OTP, 'register');
      assert.equal(r, true);
      assert.equal(ctx.calls(), 1);
      assertNoLeak(ctx);
    },
  );
});

test('7) production + msgdogs 設定完整 + fetch 失敗 → false、log 無 OTP/手機/payload/sign/secret/完整 response', async () => {
  await withSandbox(
    { NODE_ENV: 'production', SMS_PROVIDER: 'msgdogs', MSGDOGS_MERCHANT_CODE: MERCHANT, MSGDOGS_SECRET_KEY: SECRET },
    async () => jsonResponse({ error: true, code: 99, msg: 'provider-detail-should-not-be-logged' }, 400),
    async (ctx) => {
      const r = await sms.sendOtpSms(PHONE, OTP, 'register');
      assert.equal(r, false);
      assert.equal(ctx.calls(), 1);
      assertNoLeak(ctx);
      assert.ok(!ctx.out().includes('provider-detail-should-not-be-logged'), '不得 stringify 完整 provider response');
    },
  );
});

test('8) development + SMS_PROVIDER 未設定 → true、保留本地 console OTP', async () => {
  await withSandbox({ NODE_ENV: 'development' }, null, async (ctx) => {
    const r = await sms.sendOtpSms(PHONE, OTP, 'register');
    assert.equal(r, true);
    assert.equal(ctx.calls(), 0);
    assert.ok(ctx.logs.join('\n').includes(OTP), '本地開發應在 console 顯示 OTP');
  });
});

test('9) development + console → true、保留本地測試行為', async () => {
  await withSandbox({ NODE_ENV: 'development', SMS_PROVIDER: 'console' }, null, async (ctx) => {
    const r = await sms.sendOtpSms(PHONE, OTP, 'reset');
    assert.equal(r, true);
    assert.equal(ctx.calls(), 0);
    assert.ok(ctx.logs.join('\n').includes(OTP));
  });
});

test('10) isSmsConfigured 判斷矩陣', async () => {
  await withSandbox({}, null, async () => {
    assert.equal(sms.isSmsConfigured(), false, 'SMS_PROVIDER undefined → false');
  });
  await withSandbox({ SMS_PROVIDER: 'console' }, null, async () => {
    assert.equal(sms.isSmsConfigured(), false, 'console → false');
  });
  await withSandbox({ SMS_PROVIDER: 'nope' }, null, async () => {
    assert.equal(sms.isSmsConfigured(), false, 'unknown → false');
  });
  await withSandbox({ SMS_PROVIDER: 'msgdogs', MSGDOGS_MERCHANT_CODE: MERCHANT }, null, async () => {
    assert.equal(sms.isSmsConfigured(), false, 'msgdogs 缺 secret → false');
  });
  await withSandbox({ SMS_PROVIDER: 'msgdogs', MSGDOGS_SECRET_KEY: SECRET }, null, async () => {
    assert.equal(sms.isSmsConfigured(), false, 'msgdogs 缺 merchant → false');
  });
  await withSandbox({ SMS_PROVIDER: 'msgdogs', MSGDOGS_MERCHANT_CODE: '   ', MSGDOGS_SECRET_KEY: SECRET }, null, async () => {
    assert.equal(sms.isSmsConfigured(), false, 'merchant 空白 → false');
  });
  await withSandbox({ SMS_PROVIDER: 'msgdogs', MSGDOGS_MERCHANT_CODE: MERCHANT, MSGDOGS_SECRET_KEY: SECRET }, null, async () => {
    assert.equal(sms.isSmsConfigured(), true, 'msgdogs 完整 → true');
  });
});

// ── health readiness（O 九.11~九.12）────────────────────────────────────────
// 注意：正式「全部正常→200」需要「可用 Redis 的實際 ping」——bare-node ESM 測試環境無法偽造
// （getRedis 內部 require('@upstash/redis') 在 ESM 下不可用，會被 health 的 try/catch 吞成 redisPing=false）。
// 故此處覆蓋「fail-closed 方向」：SMS 未設定→503/ready:false/smsConfigured:false；並驗證 smsConfigured 欄位
// 正確反映 isSmsConfigured；以及本地 dev→200/ready:true/smsConfigured:false。全綠正向由部署後 /api/health 驗證。

test('11a) health production + SMS 未設定 → 503、ready:false、smsConfigured:false', async () => {
  await withSandbox({ NODE_ENV: 'production', SESSION_SECRET: 'x' }, null, async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    assert.equal(res.status, 503);
    assert.equal(res.body.ready, false);
    assert.equal(res.body.smsConfigured, false);
  });
});

test('11b) health production + SMS 設定完整（但本地無 Redis）→ smsConfigured:true，且 ready 因缺 Redis 仍 false', async () => {
  await withSandbox(
    { NODE_ENV: 'production', SESSION_SECRET: 'x', SMS_PROVIDER: 'msgdogs', MSGDOGS_MERCHANT_CODE: MERCHANT, MSGDOGS_SECRET_KEY: SECRET },
    null,
    async () => {
      const { GET } = await import('@/app/api/health/route');
      const res = await GET();
      assert.equal(res.body.smsConfigured, true, 'smsConfigured 欄位須反映 isSmsConfigured');
      assert.equal(res.body.ready, false, 'ready 公式須同時要求 redisPing（本地無 Redis→false）');
      assert.equal(res.status, 503);
    },
  );
});

test('12) health development + console → 200、ready:true、smsConfigured:false', async () => {
  await withSandbox({ NODE_ENV: 'development', SMS_PROVIDER: 'console' }, null, async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    assert.equal(res.status, 200);
    assert.equal(res.body.ready, true);
    assert.equal(res.body.smsConfigured, false, 'dev 仍如實顯示正式簡訊商未設定');
  });
});

test('11c) health body 不揭露 SMS secret / merchant 值', async () => {
  await withSandbox(
    { NODE_ENV: 'production', SESSION_SECRET: 'x', SMS_PROVIDER: 'msgdogs', MSGDOGS_MERCHANT_CODE: MERCHANT, MSGDOGS_SECRET_KEY: SECRET },
    null,
    async () => {
      const { GET } = await import('@/app/api/health/route');
      const res = await GET();
      const serialized = JSON.stringify(res.body);
      assert.ok(!serialized.includes(SECRET), 'health 不得輸出 SECRET');
      assert.ok(!serialized.includes(MERCHANT), 'health 不得輸出 merchant 值');
      assert.ok(!('MSGDOGS_SECRET_KEY' in res.body.env), 'env 不得新增 MSGDOGS 欄位');
    },
  );
});

// ── auth send-otp（O 九.13）──────────────────────────────────────────────────
// 正式 SMS 未設定 → 整體 fail-closed（register/reset、帳號存在與否一律相同 503）：不 saveOtp、不回 devCode、不 ok:true。
// development console → 仍回 devCode。

let phoneSeq = 10000000;
const uniqPhone = () => '09' + String(phoneSeq++);
function authPost(body) {
  return new Request('http://localhost/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.' + (phoneSeq % 200) },
    body: JSON.stringify(body),
  });
}

test('13a) production + SMS 未設定：send-otp register → 503、不回 devCode、不 ok', async () => {
  await withSandbox({ NODE_ENV: 'production', SESSION_SECRET: 'x' }, null, async () => {
    const { POST } = await import('@/app/api/auth/route');
    const res = await POST(authPost({ action: 'send-otp', purpose: 'register', phone: uniqPhone() }));
    assert.equal(res.status, 503);
    assert.equal(res.body?.ok, undefined);
    assert.equal(res.body?.devCode, undefined);
  });
});

test('13b) production + SMS 未設定：reset 對「存在」與「不存在」帳號皆 503（不洩漏帳號是否存在）', async () => {
  await withSandbox({ NODE_ENV: 'production', SESSION_SECRET: 'x' }, null, async () => {
    const { POST } = await import('@/app/api/auth/route');
    const authStore = await import('@/lib/auth-store');
    const existPhone = uniqPhone();
    await authStore.createCustomer(existPhone, 'pw123456', 'u'); // 建一個確實存在的客戶
    const notExistPhone = uniqPhone();
    const r1 = await POST(authPost({ action: 'send-otp', purpose: 'reset', phone: existPhone }));
    const r2 = await POST(authPost({ action: 'send-otp', purpose: 'reset', phone: notExistPhone }));
    assert.equal(r1.status, 503);
    assert.equal(r2.status, 503);
    assert.equal(r1.body?.devCode, undefined);
    assert.equal(r2.body?.devCode, undefined);
  });
});

test('13c) development + console：send-otp register 仍回 devCode', async () => {
  await withSandbox({ NODE_ENV: 'development', SMS_PROVIDER: 'console' }, null, async () => {
    const { POST } = await import('@/app/api/auth/route');
    const res = await POST(authPost({ action: 'send-otp', purpose: 'register', phone: uniqPhone() }));
    assert.equal(res.status, 200);
    assert.equal(res.body?.ok, true);
    assert.equal(typeof res.body?.devCode, 'string');
    assert.ok(/^\d{4,8}$/.test(res.body.devCode));
  });
});
