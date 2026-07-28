// O 測試：正式環境 SMS fail-closed + OTP-only 通道 + health readiness。
// 直接載入「真正的」production 程式（sms.ts、health route、auth route），不複製邏輯。
// 不呼叫真實 MsgDogs、不送真實簡訊：global.fetch 全程被 mock；不連真實 Redis。
//
// 執行方式（不需 dev server；用 Node module hook 載入 .ts，零新增套件）：
//   node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/sms-failclosed.test.mjs
//
// 環境隔離：每個測試完整快照/還原 process.env、global.fetch、console.log/console.error，避免互相污染。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sms = await import('@/lib/sms');

// 測試會觸碰到的環境變數（完整快照/還原）
const ENV_KEYS = [
  'NODE_ENV', 'VERCEL_ENV', 'SMS_PROVIDER',
  'MSGDOGS_MERCHANT_CODE', 'MSGDOGS_SECRET_KEY', 'MSGDOGS_MODE',
  'MSGDOGS_OTP_TEMPLATE_REGISTER', 'MSGDOGS_OTP_TEMPLATE_RESET',
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
// 註冊/重設用不同的模板 ID，才能驗證「依用途讀對應環境變數」。非機密（模板 ID 不是 secret）。
const TPL_REGISTER = 'tpl-register-001';
const TPL_RESET = 'tpl-reset-002';

// 「正式且設定完整」的環境（含兩個 OTP 模板 ID）。
const FULL = {
  NODE_ENV: 'production', SMS_PROVIDER: 'msgdogs',
  MSGDOGS_MERCHANT_CODE: MERCHANT, MSGDOGS_SECRET_KEY: SECRET,
  MSGDOGS_OTP_TEMPLATE_REGISTER: TPL_REGISTER, MSGDOGS_OTP_TEMPLATE_RESET: TPL_RESET,
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

// 解析 mock fetch 收到的請求（form-urlencoded 或 json），回 { url, params }。
function parseReq(url, init) {
  const headers = (init && init.headers) || {};
  const ct = String(headers['Content-Type'] || headers['content-type'] || '').toLowerCase();
  const raw = init && typeof init.body === 'string' ? init.body : '';
  let params = {};
  if (ct.includes('application/json')) {
    try { params = JSON.parse(raw); } catch { params = {}; }
  } else {
    for (const [k, v] of new URLSearchParams(raw)) params[k] = v;
  }
  return { url: String(url), params };
}

// 建立乾淨沙盒：清空相關 env → 套 overrides；mock fetch/console；跑 fn；最後完整還原。
async function withSandbox(overrides, fetchImpl, fn) {
  const snap = snapshotEnv();
  const origFetch = global.fetch, origLog = console.log, origErr = console.error;
  const logs = [], errs = [], requests = [];
  let fetchCalls = 0;
  console.log = (...a) => logs.push(a.map(String).join(' '));
  console.error = (...a) => errs.push(a.map(String).join(' '));
  global.fetch = async (url, init) => {
    fetchCalls++;
    requests.push(parseReq(url, init));
    return fetchImpl ? await fetchImpl(url, init) : jsonResponse({ error: false, code: 200 });
  };
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(overrides)) if (v !== undefined) process.env[k] = v;
  const ctx = {
    logs, errs, requests,
    calls: () => fetchCalls,
    last: () => requests[requests.length - 1],
    out: () => logs.concat(errs).join('\n'),
  };
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

// ── 靜態保證：原始碼不再有 single 通道殘留（要求：可執行路徑不存在 send-single）─────────
test('原始碼 sms.ts 不再含 send-single / template_text / MSGDOGS_OTP_TAG / MSGDOGS_MODE', () => {
  const src = readFileSync(new URL('../src/lib/sms.ts', import.meta.url), 'utf8');
  assert.ok(!src.includes('send-single'), 'sms.ts 不得含 send-single');
  assert.ok(!src.includes('template_text'), 'sms.ts 不得含 template_text');
  assert.ok(!src.includes('MSGDOGS_OTP_TAG'), 'sms.ts 不得含 MSGDOGS_OTP_TAG');
  assert.ok(!src.includes('MSGDOGS_MODE'), 'sms.ts 不得再讀 MSGDOGS_MODE');
});

// ── sendOtpSms：正式環境 fail-closed ─────────────────────────────────────────
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
  await withSandbox(
    { NODE_ENV: 'production', SMS_PROVIDER: 'msgdogs', MSGDOGS_SECRET_KEY: SECRET, MSGDOGS_OTP_TEMPLATE_REGISTER: TPL_REGISTER, MSGDOGS_OTP_TEMPLATE_RESET: TPL_RESET },
    null,
    async (ctx) => {
      const r = await sms.sendOtpSms(PHONE, OTP, 'register');
      assert.equal(r, false);
      assert.equal(ctx.calls(), 0);
      assertNoLeak(ctx);
    },
  );
});

test('5) production + msgdogs 但缺 secret → false、無 fetch', async () => {
  await withSandbox(
    { NODE_ENV: 'production', SMS_PROVIDER: 'msgdogs', MSGDOGS_MERCHANT_CODE: MERCHANT, MSGDOGS_OTP_TEMPLATE_REGISTER: TPL_REGISTER, MSGDOGS_OTP_TEMPLATE_RESET: TPL_RESET },
    null,
    async (ctx) => {
      const r = await sms.sendOtpSms(PHONE, OTP, 'register');
      assert.equal(r, false);
      assert.equal(ctx.calls(), 0);
      assertNoLeak(ctx);
    },
  );
});

test('5b) production + msgdogs 但缺 OTP 模板 ID → false、無 fetch（fail-closed）', async () => {
  await withSandbox(
    { NODE_ENV: 'production', SMS_PROVIDER: 'msgdogs', MSGDOGS_MERCHANT_CODE: MERCHANT, MSGDOGS_SECRET_KEY: SECRET },
    null,
    async (ctx) => {
      assert.equal(sms.isSmsConfigured(), false, '缺模板 ID → 視為未設定');
      const r = await sms.sendOtpSms(PHONE, OTP, 'register');
      assert.equal(r, false);
      assert.equal(ctx.calls(), 0);
      assertNoLeak(ctx);
    },
  );
});

// ── OTP 通道正確性：只打 send-otp、依用途選模板、variable_data 只有 { code }、無 tag ──────
test('6) production 設定完整 + register：只呼叫 /api/sms/send-otp、用 REGISTER 模板、variable_data={code}、無 tag', async () => {
  await withSandbox(FULL, null, async (ctx) => {
    assert.equal(sms.isSmsConfigured(), true);
    const r = await sms.sendOtpSms(PHONE, OTP, 'register');
    assert.equal(r, true);
    assert.equal(ctx.calls(), 1);

    const req = ctx.last();
    assert.ok(req.url.endsWith('/api/sms/send-otp'), `必須打 send-otp，收到 ${req.url}`);
    assert.ok(!req.url.includes('send-single'), '不得打 send-single');
    assert.equal(req.params.otp_template_id, TPL_REGISTER, 'register 須用 MSGDOGS_OTP_TEMPLATE_REGISTER');
    assert.equal(req.params.template_text, undefined, '不得帶 template_text');

    const vd = JSON.parse(req.params.variable_data);
    assert.deepEqual(vd, { code: OTP }, 'variable_data 解析後須恰好只有 { code }');
    assert.deepEqual(Object.keys(vd).sort(), ['code'], 'variable_data 只有 code 一個鍵');
    assert.equal(vd.tag, undefined, '不得含 tag');

    assertNoLeak(ctx);
  });
});

test('6b) production 設定完整 + reset：用 RESET 模板、仍只打 send-otp、variable_data={code}', async () => {
  await withSandbox(FULL, null, async (ctx) => {
    const r = await sms.sendOtpSms(PHONE, OTP, 'reset');
    assert.equal(r, true);
    assert.equal(ctx.calls(), 1);

    const req = ctx.last();
    assert.ok(req.url.endsWith('/api/sms/send-otp'));
    assert.equal(req.params.otp_template_id, TPL_RESET, 'reset 須用 MSGDOGS_OTP_TEMPLATE_RESET');
    assert.deepEqual(JSON.parse(req.params.variable_data), { code: OTP });
    assertNoLeak(ctx);
  });
});

test('6c) MSGDOGS_MODE=single 仍不得走 send-single（模式已被移除）', async () => {
  await withSandbox({ ...FULL, MSGDOGS_MODE: 'single' }, null, async (ctx) => {
    const r = await sms.sendOtpSms(PHONE, OTP, 'register');
    assert.equal(r, true);
    assert.equal(ctx.calls(), 1);
    const req = ctx.last();
    assert.ok(req.url.endsWith('/api/sms/send-otp'), 'MODE=single 也必須打 send-otp');
    assert.ok(!req.url.includes('send-single'), 'MODE=single 不得打 send-single');
    assert.equal(req.params.template_text, undefined, 'MODE=single 不得帶 template_text');
  });
});

test('7) production 設定完整 + provider 失敗 → false、只呼叫 1 次（不 fallback）、不洩漏', async () => {
  await withSandbox(
    FULL,
    async () => jsonResponse({ error: true, code: 500, msg: 'provider-detail-should-not-be-logged' }, 200),
    async (ctx) => {
      const r = await sms.sendOtpSms(PHONE, OTP, 'register');
      assert.equal(r, false);
      assert.equal(ctx.calls(), 1, '失敗不得 fallback 到 send-single/console，只呼叫一次');
      // 確認唯一一次呼叫仍是 send-otp（沒有第二次退回其他通道）
      assert.ok(ctx.last().url.endsWith('/api/sms/send-otp'));
      assertNoLeak(ctx);
      assert.ok(!ctx.out().includes('provider-detail-should-not-be-logged'), '不得 stringify 完整 provider response');
    },
  );
});

// ── development：保留 console OTP ─────────────────────────────────────────────
test('8) development + SMS_PROVIDER 未設定 → true、保留本地 console OTP、無 fetch', async () => {
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

// ── isSmsConfigured 判斷矩陣（含新的模板 ID 要求）───────────────────────────────
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
    assert.equal(sms.isSmsConfigured(), false, 'msgdogs 缺 secret/模板 → false');
  });
  await withSandbox({ SMS_PROVIDER: 'msgdogs', MSGDOGS_SECRET_KEY: SECRET }, null, async () => {
    assert.equal(sms.isSmsConfigured(), false, 'msgdogs 缺 merchant/模板 → false');
  });
  await withSandbox(
    { SMS_PROVIDER: 'msgdogs', MSGDOGS_MERCHANT_CODE: MERCHANT, MSGDOGS_SECRET_KEY: SECRET },
    null,
    async () => { assert.equal(sms.isSmsConfigured(), false, 'merchant+secret 齊、缺兩個模板 → false'); },
  );
  await withSandbox(
    { SMS_PROVIDER: 'msgdogs', MSGDOGS_MERCHANT_CODE: MERCHANT, MSGDOGS_SECRET_KEY: SECRET, MSGDOGS_OTP_TEMPLATE_REGISTER: TPL_REGISTER },
    null,
    async () => { assert.equal(sms.isSmsConfigured(), false, '只有 register 模板、缺 reset → false'); },
  );
  await withSandbox({ ...FULL, MSGDOGS_MERCHANT_CODE: '   ' }, null, async () => {
    assert.equal(sms.isSmsConfigured(), false, 'merchant 空白 → false');
  });
  await withSandbox(FULL, null, async () => {
    assert.equal(sms.isSmsConfigured(), true, 'merchant+secret+兩個模板齊 → true');
  });
});

// ── health readiness ─────────────────────────────────────────────────────────
// 正式「全部正常→200」需要「可用 Redis 的實際 ping」——bare-node ESM 測試環境無法偽造，
// 故此處覆蓋「fail-closed 方向」；全綠正向由部署後 /api/health 驗證。

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
  await withSandbox({ ...FULL, SESSION_SECRET: 'x' }, null, async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    assert.equal(res.body.smsConfigured, true, 'smsConfigured 欄位須反映 isSmsConfigured');
    assert.equal(res.body.ready, false, 'ready 公式須同時要求 redisPing（本地無 Redis→false）');
    assert.equal(res.status, 503);
  });
});

test('11d) health production + SMS 缺模板 → smsConfigured:false（不因移除 MSGDOGS_MODE 而誤判可用）', async () => {
  await withSandbox(
    { NODE_ENV: 'production', SESSION_SECRET: 'x', SMS_PROVIDER: 'msgdogs', MSGDOGS_MERCHANT_CODE: MERCHANT, MSGDOGS_SECRET_KEY: SECRET, MSGDOGS_MODE: 'otp' },
    null,
    async () => {
      const { GET } = await import('@/app/api/health/route');
      const res = await GET();
      assert.equal(res.body.smsConfigured, false, '缺兩個模板 ID → 不可視為 SMS 可用');
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

test('11c) health body 不揭露 SMS secret / merchant 值 / 模板內容', async () => {
  await withSandbox({ ...FULL, SESSION_SECRET: 'x' }, null, async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes(SECRET), 'health 不得輸出 SECRET');
    assert.ok(!serialized.includes(MERCHANT), 'health 不得輸出 merchant 值');
    assert.ok(!serialized.includes(TPL_REGISTER), 'health 不得輸出模板 ID');
    assert.ok(!('MSGDOGS_SECRET_KEY' in res.body.env), 'env 不得新增 MSGDOGS 欄位');
  });
});

// ── auth send-otp（正式 fail-closed / dev devCode）：註冊與忘記密碼流程行為不變 ──────────
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
