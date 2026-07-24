// /api/sync shape-validation 整合測試（針對修復項 C：防污染資料造成同步整批 500 / DoS）。
//
// 為何用整合測試而非單元測試：本專案未安裝測試框架，且 route.ts 使用 `@/` 路徑別名與
// 無副檔名 import，bare node 無法直接載入 route.ts。故改用 Node 內建 `node --test`（零安裝）
// 對「執行中的 dev server」打真正的 /api/sync 與 /api/auth 端點來驗證。
//
// ⚠️ 這是整合測試，需要「先啟動 dev server」才能通過；單獨 `node --test` 不會通過（會連線失敗）。
// 執行方式（本地無 Redis 走記憶體 fallback）：
//   1) 另一個終端機：npm run dev
//   2) node --test tests/sync-shape.test.mjs
// 可用環境變數 BASE 覆寫（預設 http://localhost:3000）。
// 安全機制（見下方 setup）：僅允許 loopback，且若偵測到已設定 Redis 且 keyPrefix 非 test 前綴，
// 立即中止、不註冊帳號、不寫入任何資料——避免污染正式/共享資料。

import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://localhost:3000';

function cookieFrom(res) {
  const sc = res.headers.get('set-cookie') || '';
  const m = sc.match(/sl_session=([^;]+)/);
  return m ? `sl_session=${m[1]}` : '';
}

async function registerCustomer(phone) {
  const otpRes = await fetch(`${BASE}/api/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'send-otp', purpose: 'register', phone }),
  });
  const otp = await otpRes.json();
  const code = otp.devCode; // 本地/非生產才會回傳
  assert.ok(code, 'send-otp 應回傳 devCode（需在本地非生產環境執行）');
  const regRes = await fetch(`${BASE}/api/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', phone, password: 'secret123', nickname: 't', code }),
  });
  const reg = await regRes.json();
  assert.equal(regRes.status, 200, 'register 應成功');
  return { cookie: cookieFrom(regRes), userId: reg.user.id };
}

async function postPatch(cookie, patch) {
  const res = await fetch(`${BASE}/api/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ patch }),
  });
  let body = null; try { body = await res.json(); } catch {}
  return { status: res.status, body };
}

const now = () => new Date().toISOString();
const uniq = (p) => `${p}-${Math.floor(Math.random() * 1e9)}`;

test('setup: 安全檢查 + 註冊客戶取得 session', async (t) => {
  // 安全①：只允許打本機 loopback（避免誤打遠端/正式站）
  const host = new URL(BASE).hostname;
  assert.ok(['localhost', '127.0.0.1', '::1', '[::1]'].includes(host), `BASE 必須是 loopback，收到 ${host}`);
  // 安全②：確認不是打到真實/共享 Redis（避免污染資料）。本地記憶體 fallback: redisConfigured=false → 放行。
  const healthRes = await fetch(`${BASE}/api/health`);
  const health = await healthRes.json();
  if (health.redisConfigured === true && !String(health.keyPrefix || '').startsWith('test')) {
    throw new Error(`拒絕執行：偵測到已設定 Redis 且 keyPrefix="${health.keyPrefix}" 非 test 前綴；為避免污染資料，測試中止（未註冊、未寫入任何資料）。`);
  }
  t.diagnostic(`safety ok: host=${host} redisConfigured=${health.redisConfigured} keyPrefix=${health.keyPrefix}`);

  const phone = '09' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const { cookie, userId } = await registerCustomer(phone);
  t.diagnostic(`userId=${userId}`);
  assert.ok(cookie.startsWith('sl_session='));

  await t.test('合法 chatMessage 通過並可見於自己 scope', async () => {
    const id = uniq('cm');
    const threadId = `${userId}-u-999`;
    const { status, body } = await postPatch(cookie, {
      chatMessages: [{ id, threadId, senderId: userId, text: 'hi', createdAt: now() }],
    });
    assert.equal(status, 200);
    assert.ok((body.chatMessages || []).some((m) => m.id === id), '合法訊息應寫入並回傳於自己 scope');
  });

  await t.test('threadId:null 不得寫入（丟棄），GET 仍 200', async () => {
    const id = uniq('bad');
    const { status } = await postPatch(cookie, {
      chatMessages: [{ id, threadId: null, senderId: userId, text: 'x', createdAt: now() }],
    });
    assert.ok(status === 200 || status === 400, 'threadId:null 應被丟棄(200) 或整批拒絕(400)');
    const get = await fetch(`${BASE}/api/sync`, { headers: { Cookie: cookie } });
    assert.equal(get.status, 200, '污染嘗試後 GET 不得 500');
    const gb = await get.json();
    assert.ok(!(gb.chatMessages || []).some((m) => m.id === id), 'threadId:null 訊息不得寫入');
  });

  await t.test('senderId:null 被拒（不寫入）', async () => {
    const id = uniq('bad');
    await postPatch(cookie, { chatMessages: [{ id, threadId: `${userId}-x`, senderId: null, text: 'x', createdAt: now() }] });
    const get = await (await fetch(`${BASE}/api/sync`, { headers: { Cookie: cookie } })).json();
    assert.ok(!(get.chatMessages || []).some((m) => m.id === id));
  });

  await t.test('createdAt 無效日期被拒（不寫入）', async () => {
    const id = uniq('bad');
    await postPatch(cookie, { chatMessages: [{ id, threadId: `${userId}-x`, senderId: userId, text: 'x', createdAt: 'not-a-date' }] });
    const get = await (await fetch(`${BASE}/api/sync`, { headers: { Cookie: cookie } })).json();
    assert.ok(!(get.chatMessages || []).some((m) => m.id === id));
  });

  await t.test('id 空字串被丟棄（整批仍 200）', async () => {
    const { status } = await postPatch(cookie, { chatMessages: [{ id: '', threadId: `${userId}-x`, senderId: userId, text: 'x', createdAt: now() }] });
    assert.equal(status, 200);
  });

  await t.test('null item 被丟棄（不使請求失敗/不 500）', async () => {
    const { status } = await postPatch(cookie, { chatMessages: [null] });
    assert.equal(status, 200);
  });

  await t.test('collection 不是陣列 → 400', async () => {
    const { status } = await postPatch(cookie, { chatMessages: 'oops' });
    assert.equal(status, 400);
  });

  await t.test('未知 collection key 被忽略、不寫入（不 500）', async () => {
    const { status } = await postPatch(cookie, { notARealCollection: [{ id: 'x' }] });
    assert.equal(status, 200);
  });

  await t.test('item 數量超過上限(20000) → 400', async () => {
    // 上限為 payload 安全天花板 20000（見 route.ts 註解）；超過才 400。用 20001 筆驗證邊界。
    const many = Array.from({ length: 20001 }, (_, i) => ({ id: `m${i}`, threadId: `${userId}-x`, senderId: userId, text: 'x', createdAt: now() }));
    const { status } = await postPatch(cookie, { chatMessages: many });
    assert.equal(status, 400);
  });

  await t.test('達上限內的大量快照(含外來項) 仍通過 → 不整批 400', async () => {
    // 模擬 full-snapshot：大量項目（含很多非本人 senderId 的「外來項」，稍後由授權過濾丟棄）
    // 只要未超過安全天花板就不得整批 400（回歸驗證 review 第 1 點）。
    const snapshot = Array.from({ length: 3000 }, (_, i) => ({ id: `s${i}`, threadId: `u-aaa-u-bbb`, senderId: `u-other-${i}`, text: 'x', createdAt: now() }));
    const { status } = await postPatch(cookie, { chatMessages: snapshot });
    assert.equal(status, 200, '含外來項的大量合法快照應通過（授權過濾在後、不在此擋）');
  });

  await t.test('patch 為陣列 → 400', async () => {
    const res = await fetch(`${BASE}/api/sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ patch: [] }),
    });
    assert.equal(res.status, 400);
  });
});
