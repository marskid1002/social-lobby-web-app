// F 測試：停用/已刪除帳號不得用舊 session 寫入。
// 直接載入「真正的」production 程式：共用 helper requireActiveSession、6 個 route 的 POST/GET、
// session 簽發與 auth-store（本地記憶體 fallback）。不複製授權邏輯。
//
// 執行方式（不需 dev server；用 Node module hook 載入 .ts，零新增套件）：
//   node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/active-session.test.mjs
//
// 測試安全：僅本機記憶體 fallback。如偵測到任何 Redis 環境變數，會 skip 會寫入/改帳號的測試，
// 避免連到正式/共享 Redis 或改動真實帳號。不新增真實帳號、不清除任何資料。

import test from 'node:test';
import assert from 'node:assert/strict';

const REDIS = !!(
  process.env.KV_REST_API_URL || process.env.KV_URL ||
  process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL
);
const skip = REDIS ? '偵測到 Redis 環境變數：跳過會寫入/改帳號的測試以免污染資料' : false;

const { requireActiveSession } = await import('@/lib/active-session');
const { signSession } = await import('@/lib/session');
const authStore = await import('@/lib/auth-store');

function cookieHeader(token) {
  return `sl_session=${encodeURIComponent(token)}`;
}
function postReq(url, token, body) {
  return new Request(url, {
    method: 'POST',
    headers: { ...(token ? { cookie: cookieHeader(token) } : {}), 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}
function getReq(url, token) {
  return new Request(url, { method: 'GET', headers: token ? { cookie: cookieHeader(token) } : {} });
}
const managerSession = (userId) => ({ userId, role: 'manager', tier: 'vip' });

// ── 共用 helper（F 六.1~六.6）────────────────────────────────────────────────

test('helper：無 session → 401', async () => {
  const r = await requireActiveSession(new Request('http://x/api/sync', { method: 'POST' }));
  assert.equal(r.ok, false);
  assert.equal(r.response.status, 401);
});

test('helper：無效 JWT → 401', async () => {
  const r = await requireActiveSession(postReq('http://x/api/sync', 'not.a.real.jwt', {}));
  assert.equal(r.ok, false);
  assert.equal(r.response.status, 401);
});

test('helper：有效 session 但帳號不存在（已刪除）→ 401', async () => {
  const token = await signSession({ userId: 'c-does-not-exist-xyz', role: 'user', tier: 'standard' });
  const r = await requireActiveSession(postReq('http://x/api/sync', token, {}));
  assert.equal(r.ok, false);
  assert.equal(r.response.status, 401);
});

test('helper：有效 session 但帳號 disabled → 403', { skip }, async () => {
  // A001 → u-018（幹部，ensureManagerAccounts 會自動建立於記憶體）
  assert.equal(await authStore.setAccountDisabled('A001', true), true);
  try {
    const token = await signSession(managerSession('u-018'));
    const r = await requireActiveSession(postReq('http://x/api/sync', token, {}));
    assert.equal(r.ok, false);
    assert.equal(r.response.status, 403);
  } finally {
    await authStore.setAccountDisabled('A001', false); // 還原
  }
});

test('helper：正常啟用帳號 → ok 且回傳可信任 session/account', { skip }, async () => {
  const acc = await authStore.getAccount('A002'); // u-023 幹部，未停用
  assert.ok(acc && acc.userId === 'u-023');
  const token = await signSession(managerSession('u-023'));
  const r = await requireActiveSession(postReq('http://x/api/sync', token, {}));
  assert.equal(r.ok, true);
  assert.equal(r.isGuest, false);
  assert.equal(r.session.userId, 'u-023');
  assert.equal(r.account?.userId, 'u-023');
});

test('helper：guest → ok 且 isGuest=true、不查帳號', async () => {
  const token = await signSession({ userId: 'g-abc', role: 'guest', tier: 'free' });
  const r = await requireActiveSession(postReq('http://x/api/sync', token, {}));
  assert.equal(r.ok, true);
  assert.equal(r.isGuest, true);
  assert.equal(r.account, null);
});

// ── Route 層：disabled 帳號持原本有效 token 時，各寫入被拒且無副作用（F 六.7）──────

test('Route：disabled 帳號的寫入一律被拒（sync/notify/upload/report/subscribe/billing checkout）', { skip }, async () => {
  assert.equal(await authStore.setAccountDisabled('A001', true), true); // u-018 停用
  try {
    const token = await signSession(managerSession('u-018'));

    await test('POST /api/sync 被拒(403) 且訊息未寫入', async () => {
      const { POST } = await import('@/app/api/sync/route');
      const { getCollection } = await import('@/lib/sync-store');
      const id = `f-cm-${Math.floor(Math.random() * 1e9)}`;
      const before = (await getCollection('chatMessages')).some((m) => m.id === id);
      assert.equal(before, false);
      const res = await POST(postReq('http://x/api/sync', token, {
        patch: { chatMessages: [{ id, threadId: 'u-018-u-999', senderId: 'u-018', text: 'x', createdAt: new Date().toISOString() }] },
      }));
      assert.equal(res.status, 403);
      const after = (await getCollection('chatMessages')).some((m) => m.id === id);
      assert.equal(after, false, 'disabled 帳號的訊息不得寫入');
    });

    await test('POST /api/notify 被拒(403)（rate limit/推播前）', async () => {
      const { POST } = await import('@/app/api/notify/route');
      const res = await POST(postReq('http://x/api/notify', token, { title: 't', body: 'b', userIds: ['u-999'] }));
      assert.equal(res.status, 403);
    });

    await test('POST /api/upload 被拒(403)（上傳與刪除皆是，Blob 操作前）', async () => {
      const { POST } = await import('@/app/api/upload/route');
      const up = await POST(postReq('http://x/api/upload', token, { userId: 'u-018', dataUrl: 'data:image/png;base64,AAAA' }));
      assert.equal(up.status, 403);
      const del = await POST(postReq('http://x/api/upload', token, { action: 'delete', url: 'https://x.blob.vercel-storage.com/a.png' }));
      assert.equal(del.status, 403);
    });

    await test('POST /api/report 被拒(403) 且未建立檢舉', async () => {
      const { POST } = await import('@/app/api/report/route');
      const { listReports } = await import('@/lib/report-store');
      const beforeN = (await listReports()).length;
      const res = await POST(postReq('http://x/api/report', token, { targetId: 'u-999', reason: 'x' }));
      assert.equal(res.status, 403);
      const afterN = (await listReports()).length;
      assert.equal(afterN, beforeN, 'disabled 帳號不得建立 report');
    });

    await test('POST /api/subscribe 被拒(403) 且未儲存訂閱', async () => {
      const { POST } = await import('@/app/api/subscribe/route');
      const { getSubscriptionsForUsers } = await import('@/lib/push-store');
      const res = await POST(postReq('http://x/api/subscribe', token, { subscription: { endpoint: 'https://push.example/f-disabled' } }));
      assert.equal(res.status, 403);
      const subs = await getSubscriptionsForUsers(['u-018']);
      assert.ok(!subs.some((s) => s.endpoint === 'https://push.example/f-disabled'), 'disabled 帳號不得儲存訂閱');
    });

    await test('POST /api/billing checkout 被拒(403)', async () => {
      const { POST } = await import('@/app/api/billing/route');
      const res = await POST(postReq('http://x/api/billing', token, { action: 'checkout', plan: 'monthly' }));
      assert.equal(res.status, 403);
    });
  } finally {
    await authStore.setAccountDisabled('A001', false); // 還原
  }
});

// ── Route 層：正常啟用帳號仍可（F 六.8），且 GET 不受 F 影響（F 六.9）───────────

test('Route：正常啟用帳號的請求不被 F 擋（非 401/403）', { skip }, async () => {
  const token = await signSession(managerSession('u-023')); // A002，未停用

  await test('POST /api/sync 空 patch → 200', async () => {
    const { POST } = await import('@/app/api/sync/route');
    const res = await POST(postReq('http://x/api/sync', token, { patch: {} }));
    assert.equal(res.status, 200);
  });

  await test('POST /api/subscribe 正常帳號 → 200 並儲存', async () => {
    const { POST } = await import('@/app/api/subscribe/route');
    const res = await POST(postReq('http://x/api/subscribe', token, { subscription: { endpoint: 'https://push.example/f-active' } }));
    assert.equal(res.status, 200);
  });
});

test('Route：/api/sync GET 不因 F 新增帳號查詢（disabled 帳號仍可讀）', { skip }, async () => {
  assert.equal(await authStore.setAccountDisabled('A001', true), true);
  try {
    const { GET } = await import('@/app/api/sync/route');
    const token = await signSession(managerSession('u-018'));
    const res = await GET(getReq('http://x/api/sync', token));
    assert.equal(res.status, 200, 'GET 讀取不受 F 影響（F 只擋寫入）');
  } finally {
    await authStore.setAccountDisabled('A001', false);
  }
});

// ── guest 相容：subscribe 仍允許 guest（F 五.2 既有行為維持）─────────────────────

test('Route：guest 仍可 /api/subscribe（維持既有行為）', { skip }, async () => {
  const { POST } = await import('@/app/api/subscribe/route');
  const token = await signSession({ userId: 'g-xyz', role: 'guest', tier: 'free' });
  const res = await POST(postReq('http://x/api/subscribe', token, { subscription: { endpoint: 'https://push.example/f-guest' } }));
  assert.equal(res.status, 200);
});

// ── billing webhook 不使用 session helper（F 六.10）──────────────────────────

test('Route：/api/billing webhook 無 cookie 仍走原本流程（非 401/403）', async () => {
  const { POST } = await import('@/app/api/billing/route');
  const res = await POST(postReq('http://x/api/billing', undefined, { action: 'webhook', event: 'noop' }));
  assert.notEqual(res.status, 401);
  assert.notEqual(res.status, 403);
});

// ── guest 在寫入端點仍 403（維持既有行為；守住 isGuest 重構）─────────────────────

test('Route：guest 在 sync/notify/upload/report 仍被拒 403', { skip }, async () => {
  const guest = await signSession({ userId: 'g-write', role: 'guest', tier: 'free' });

  await test('POST /api/sync（一般 patch，非清庫）→ 403', async () => {
    const { POST } = await import('@/app/api/sync/route');
    const res = await POST(postReq('http://x/api/sync', guest, { patch: { requests: [] } }));
    assert.equal(res.status, 403);
  });
  await test('POST /api/notify → 403', async () => {
    const { POST } = await import('@/app/api/notify/route');
    const res = await POST(postReq('http://x/api/notify', guest, { title: 't', body: 'b', userIds: ['u-999'] }));
    assert.equal(res.status, 403);
  });
  await test('POST /api/upload → 403', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const res = await POST(postReq('http://x/api/upload', guest, { userId: 'g-write', dataUrl: 'data:image/png;base64,AAAA' }));
    assert.equal(res.status, 403);
  });
  await test('POST /api/report → 403', async () => {
    const { POST } = await import('@/app/api/report/route');
    const res = await POST(postReq('http://x/api/report', guest, { targetId: 'u-999', reason: 'x' }));
    assert.equal(res.status, 403);
  });
});

// ── 正常啟用帳號在其餘寫入端點也不被 F 擋（非 401/403）─────────────────────────

test('Route：正常帳號在 notify/upload/report/billing 不被 F 擋（非 401/403）', { skip }, async () => {
  const token = await signSession(managerSession('u-023')); // A002，未停用

  await test('POST /api/notify 非 401/403（auth 通過）', async () => {
    const { POST } = await import('@/app/api/notify/route');
    const res = await POST(postReq('http://x/api/notify', token, { title: 't', body: 'b', userIds: [] }));
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
  });
  await test('POST /api/upload 缺欄位→400（auth 已通過、未觸發 Blob）', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const res = await POST(postReq('http://x/api/upload', token, {})); // 無 userId/dataUrl → 通過 auth 後回 400
    assert.equal(res.status, 400);
  });
  await test('POST /api/report 缺 targetId→400（auth+rate limit 已通過、未建立 report）', async () => {
    const { POST } = await import('@/app/api/report/route');
    const res = await POST(postReq('http://x/api/report', token, {})); // 無 targetId → 400
    assert.equal(res.status, 400);
  });
  await test('POST /api/billing checkout 非 401/403（auth 通過；金流未開放回 503）', async () => {
    const { POST } = await import('@/app/api/billing/route');
    const res = await POST(postReq('http://x/api/billing', token, { action: 'checkout', plan: 'monthly' }));
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
  });
});
