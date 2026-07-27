// H2 測試：Blob 刪除所有權。載入真正的 production 純函式與 /api/upload POST；@vercel/blob（head/del）
// 由 loader 換成 tests/blob-stub.mjs（不連真實 Blob）。不連真實 Redis（沙盒清空 Redis env → 記憶體）。
//
// 執行：node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/blob-delete.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const iu = await import('@/lib/image-upload');
const { signSession } = await import('@/lib/session');
const authStore = await import('@/lib/auth-store');
const syncStore = await import('@/lib/sync-store');

const REDIS = !!(process.env.KV_REST_API_URL || process.env.KV_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL);
const skip = REDIS ? '偵測到 Redis 環境變數：跳過 route 測試以免污染' : false;

const HOST = 'store1.public.blob.vercel-storage.com';
const newUrl = (owner, kind = 'image', uuid = '11111111-2222-3333-4444-555555555555', ext = 'jpg') =>
  `https://${HOST}/uploads/${owner}/${kind}/${uuid}.${ext}`;
const legacyUrl = (owner) => `https://${HOST}/avatars/${owner}-1699999999.jpg`;

// ══ 純函式：parseBlobUrl（H2 五/九）══════════════════════════════════════════

test('parseBlobUrl：合法 Vercel Blob URL → ok + pathname', () => {
  const r = iu.parseBlobUrl(newUrl('u-023'));
  assert.equal(r.ok, true);
  assert.equal(r.pathname, 'uploads/u-023/image/11111111-2222-3333-4444-555555555555.jpg');
});

test('9) http / host 偽造 / userinfo / encoded slash / encoded .. / 雙重編碼 / 非 Vercel → 全部拒絕', () => {
  const bad = [
    'http://' + HOST + '/uploads/u-023/image/x.jpg',              // 非 https
    'https://evil.com/uploads/u-023/image/x.jpg',                 // 非 Vercel host
    'https://store1.public.blob.vercel-storage.com.evil.com/a',                 // host suffix 偽造
    'https://evil.store1.public.blob.vercel-storage.com/uploads/u-023/image/x.jpg', // 前綴子網域偽造
    'https://user:pass@' + HOST + '/uploads/u-023/image/x.jpg',   // userinfo host
    'https://' + HOST + '/uploads%2Fu-023/image/x.jpg',           // encoded slash
    'https://' + HOST + '/uploads/%2e%2e/u-023/x.jpg',            // encoded ..
    'https://' + HOST + '/uploads/%252e%252e/x.jpg',              // 雙重編碼
    'https://' + HOST + '/uploads/../u-023/x.jpg',                // 明文 ..
    'https://' + HOST + ':8443/uploads/u-023/image/x.jpg',        // 帶 port
    'not-a-url', '', null, 12345,
  ];
  for (const u of bad) assert.equal(iu.parseBlobUrl(u).ok, false, `應拒絕：${u}`);
});

test('10) matchNewPathname / matchLegacyPathname 格式', () => {
  assert.deepEqual(iu.matchNewPathname('uploads/u-023/avatar/11111111-2222-3333-4444-555555555555.jpg'),
    { owner: 'u-023', kind: 'avatar', uuid: '11111111-2222-3333-4444-555555555555', ext: 'jpg' });
  assert.equal(iu.matchNewPathname('uploads/u-023/notakind/11111111-2222-3333-4444-555555555555.jpg'), null); // 未知 kind
  assert.equal(iu.matchNewPathname('uploads/u-023/image/not-a-uuid.jpg'), null);                              // 非 uuid
  assert.equal(iu.matchNewPathname('uploads/u-023/image/11111111-2222-3333-4444-555555555555.gif'), null);    // 非法副檔名
  assert.deepEqual(iu.matchLegacyPathname('avatars/u-002-1699999999.jpg'), { owner: 'u-002', ext: 'jpg' });
  assert.equal(iu.matchLegacyPathname('uploads/u-023/image/x.jpg'), null);
});

// ══ 純函式：authorizeBlobDeletion（H2 七.1~七.11 核心）══════════════════════

const base = { escorts: [], photoOverrides: [], photoGalleries: [] };
const authz = (over) => iu.authorizeBlobDeletion({ ...base, ...over });

test('1) 新格式 owner === session.userId → ok', () => {
  const p = 'uploads/u-023/image/11111111-2222-3333-4444-555555555555.jpg';
  assert.equal(authz({ url: newUrl('u-023'), authoritativePathname: p, urlPathname: p, sessionUserId: 'u-023' }).ok, true);
});
test('2) 新格式 owner 為其他 manager → 403', () => {
  const p = 'uploads/u-999/image/11111111-2222-3333-4444-555555555555.jpg';
  const r = authz({ url: newUrl('u-999'), authoritativePathname: p, urlPathname: p, sessionUserId: 'u-023' });
  assert.equal(r.ok, false); assert.equal(r.status, 403);
});
test('3) owner 僅子字串相似 → 403', () => {
  const p = 'uploads/u-0231/image/11111111-2222-3333-4444-555555555555.jpg';
  assert.equal(authz({ url: newUrl('u-0231'), authoritativePathname: p, urlPathname: p, sessionUserId: 'u-023' }).ok, false);
  const p2 = 'uploads/u-02/image/11111111-2222-3333-4444-555555555555.jpg';
  assert.equal(authz({ url: newUrl('u-02'), authoritativePathname: p2, urlPathname: p2, sessionUserId: 'u-023' }).ok, false);
});
test('11) head 權威 pathname 與 URL pathname 不一致 → 403', () => {
  const urlP = 'uploads/u-023/image/11111111-2222-3333-4444-555555555555.jpg';
  const authoritative = 'uploads/u-999/image/11111111-2222-3333-4444-555555555555.jpg'; // provider 回不同
  assert.equal(authz({ url: newUrl('u-023'), authoritativePathname: authoritative, urlPathname: urlP, sessionUserId: 'u-023' }).ok, false);
});
test('4) 舊格式：本人管理的 escort + URL 在 photoOverride → ok；在 gallery → ok', () => {
  const url = legacyUrl('esc-1');
  const p = 'avatars/esc-1-1699999999.jpg';
  const escorts = [{ id: 'esc-1', managerId: 'u-023' }];
  assert.equal(authz({ url, authoritativePathname: p, urlPathname: p, sessionUserId: 'u-023',
    escorts, photoOverrides: [{ id: 'esc-1', avatarUrl: url }] }).ok, true);
  assert.equal(authz({ url, authoritativePathname: p, urlPathname: p, sessionUserId: 'u-023',
    escorts, photoGalleries: [{ id: 'esc-1', urls: [url] }] }).ok, true);
});
test('5) 舊格式：其他 manager 旗下 escort → 403', () => {
  const url = legacyUrl('esc-9'); const p = 'avatars/esc-9-1699999999.jpg';
  const r = authz({ url, authoritativePathname: p, urlPathname: p, sessionUserId: 'u-023',
    escorts: [{ id: 'esc-9', managerId: 'u-999' }], photoOverrides: [{ id: 'esc-9', avatarUrl: url }] });
  assert.equal(r.ok, false); assert.equal(r.status, 403);
});
test('6) 舊格式：URL 在紀錄但 escort.managerId 不是自己 → 403', () => {
  const url = legacyUrl('esc-2'); const p = 'avatars/esc-2-1699999999.jpg';
  assert.equal(authz({ url, authoritativePathname: p, urlPathname: p, sessionUserId: 'u-023',
    escorts: [{ id: 'esc-2', managerId: 'u-777' }], photoOverrides: [{ id: 'esc-2', avatarUrl: url }] }).ok, false);
});
test('舊格式：owner 本人管理但 URL 不在任何紀錄 → 403', () => {
  const url = legacyUrl('esc-3'); const p = 'avatars/esc-3-1699999999.jpg';
  assert.equal(authz({ url, authoritativePathname: p, urlPathname: p, sessionUserId: 'u-023',
    escorts: [{ id: 'esc-3', managerId: 'u-023' }] }).ok, false);
});
test('未知 pathname 格式 → 403', () => {
  const p = 'random/thing.jpg';
  assert.equal(authz({ url: `https://${HOST}/random/thing.jpg`, authoritativePathname: p, urlPathname: p, sessionUserId: 'u-023' }).ok, false);
});

// ══ Route 層 ═══════════════════════════════════════════════════════════════

const ENV_KEYS = ['NODE_ENV', 'VERCEL_ENV', 'BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID', 'SESSION_SECRET',
  'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'REDIS_URL', 'KV_URL'];
function snapshotEnv() { const s = {}; for (const k of ENV_KEYS) s[k] = process.env[k]; return s; }
function restoreEnv(s) { for (const k of ENV_KEYS) { if (s[k] === undefined) delete process.env[k]; else process.env[k] = s[k]; } }

async function routeSandbox(overrides, fn) {
  const snap = snapshotEnv();
  const origLog = console.log, origErr = console.error;
  console.log = () => {}; console.error = () => {};
  globalThis.__BLOB_PUT_CALLS__ = []; globalThis.__BLOB_DEL_CALLS__ = []; globalThis.__BLOB_HEAD_CALLS__ = [];
  delete globalThis.__BLOB_HEAD_OVERRIDE__;
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(overrides)) if (v !== undefined) process.env[k] = v;
  try { return await fn({ dels: () => globalThis.__BLOB_DEL_CALLS__, puts: () => globalThis.__BLOB_PUT_CALLS__, heads: () => globalThis.__BLOB_HEAD_CALLS__ }); }
  finally { console.log = origLog; console.error = origErr; delete globalThis.__BLOB_HEAD_OVERRIDE__; restoreEnv(snap); }
}
async function uploadPost(sessionPayload, body) {
  const { POST } = await import('@/app/api/upload/route');
  const token = await signSession(sessionPayload);
  const req = new Request('http://localhost/api/upload', {
    method: 'POST',
    headers: { cookie: `sl_session=${encodeURIComponent(token)}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req);
}
const mgr = (userId) => ({ userId, role: 'manager', tier: 'vip' });
const BLOB_ON = { BLOB_READ_WRITE_TOKEN: 'test-token' };
const JPEG_DATA_URL = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]).toString('base64');

test('R1) manager 刪自己新格式 → 200，del 一次', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    const res = await uploadPost(mgr('u-023'), { action: 'delete', url: newUrl('u-023') });
    assert.equal(res.status, 200); assert.equal(res.body.ok, true);
    assert.equal(ctx.dels().length, 1);
  });
});
test('R2) manager 刪其他 manager 新格式 → 403，del 0', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    const res = await uploadPost(mgr('u-023'), { action: 'delete', url: newUrl('u-999') });
    assert.equal(res.status, 403); assert.equal(ctx.dels().length, 0);
  });
});
test('13) user / guest 不可 delete，del 0', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    const acc = await authStore.createCustomer('0977000001', 'pw123456', 'u');
    const u = await uploadPost({ userId: acc.userId, role: 'user', tier: 'standard' }, { action: 'delete', url: newUrl(acc.userId) });
    assert.equal(u.status, 403);
    const g = await uploadPost({ userId: 'u-099', role: 'guest', tier: 'free' }, { action: 'delete', url: newUrl('u-099') });
    assert.equal(g.status, 403);
    assert.equal(ctx.dels().length, 0);
  });
});
test('14) disabled manager 仍被擋（403），del 0', { skip }, async () => {
  await authStore.getAccount('A001'); // seed A001→u-018
  assert.equal(await authStore.setAccountDisabled('A001', true), true);
  try {
    await routeSandbox(BLOB_ON, async (ctx) => {
      const res = await uploadPost(mgr('u-018'), { action: 'delete', url: newUrl('u-018') });
      assert.equal(res.status, 403); assert.equal(ctx.dels().length, 0);
    });
  } finally { await authStore.setAccountDisabled('A001', false); }
});
test('8) 非 Vercel Blob URL → 400，del 0', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    const res = await uploadPost(mgr('u-023'), { action: 'delete', url: 'https://evil.com/uploads/u-023/image/x.jpg' });
    assert.equal(res.status, 400); assert.equal(ctx.dels().length, 0);
  });
});
test('11-route) head 權威 pathname 不一致 → 403，del 0', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    globalThis.__BLOB_HEAD_OVERRIDE__ = () => ({ pathname: 'uploads/u-999/image/11111111-2222-3333-4444-555555555555.jpg' });
    const res = await uploadPost(mgr('u-023'), { action: 'delete', url: newUrl('u-023') });
    assert.equal(res.status, 403); assert.equal(ctx.dels().length, 0);
  });
});
test('12) Blob 不存在（head NotFound）→ 冪等 200，del 0', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    globalThis.__BLOB_HEAD_OVERRIDE__ = () => { const e = new Error('nf'); e.name = 'BlobNotFoundError'; throw e; };
    const res = await uploadPost(mgr('u-023'), { action: 'delete', url: newUrl('u-023') });
    assert.equal(res.status, 200); assert.equal(res.body.ok, true);
    assert.equal(ctx.dels().length, 0);
  });
});
test('provider 錯誤（head 其他例外）→ 500，del 0', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    globalThis.__BLOB_HEAD_OVERRIDE__ = () => { throw new Error('boom'); };
    const res = await uploadPost(mgr('u-023'), { action: 'delete', url: newUrl('u-023') });
    assert.equal(res.status, 500); assert.equal(ctx.dels().length, 0);
  });
});
test('7) 偽造 body.userId/escortId/managerId 不影響授權', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    // 偽造 body 宣稱擁有 u-999 的圖，但 session 為 u-023 且 URL owner 為 u-999 → 仍 403
    const forgedOther = await uploadPost(mgr('u-023'),
      { action: 'delete', url: newUrl('u-999'), userId: 'u-999', escortId: 'x', managerId: 'u-999' });
    assert.equal(forgedOther.status, 403);
    // 偽造 body 亂填，但刪的是自己的 URL → 授權只看 session → 200
    const ownWithForged = await uploadPost(mgr('u-023'),
      { action: 'delete', url: newUrl('u-023'), userId: 'someone-else', managerId: 'u-999' });
    assert.equal(ownWithForged.status, 200);
    assert.equal(ctx.dels().length, 1);
  });
});
test('4-route) legacy：本人管理 escort + 照片紀錄（server escorts）→ 200，del 1', { skip }, async () => {
  const url = legacyUrl('esc-h2');
  await syncStore.mergeShared({
    escorts: [{ id: 'esc-h2', managerId: 'u-023', nickname: 'g', createdAt: '2026-01-01T00:00:00.000Z' }],
    photoOverrides: [{ id: 'esc-h2', avatarUrl: url }],
  });
  await routeSandbox(BLOB_ON, async (ctx) => {
    const res = await uploadPost(mgr('u-023'), { action: 'delete', url });
    assert.equal(res.status, 200); assert.equal(ctx.dels().length, 1);
  });
});
test('16) 上傳(put)無回歸：manager 合法 JPEG → 200，put 一次', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    const res = await uploadPost(mgr('u-023'), { userId: 'u-501-girl', dataUrl: JPEG_DATA_URL });
    assert.equal(res.status, 200);
    assert.equal(ctx.puts().length, 1);
    assert.ok(ctx.puts()[0].pathname.startsWith('uploads/u-023/'));
  });
});

// minor #1：Blob 不存在(head NotFound) 但 URL 非本人 → 必須先回 403（ownership 不被「存在與否」繞過），del 0
test('minor1) NotFound + 非本人 URL → 403（非冪等 200），del 0', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    globalThis.__BLOB_HEAD_OVERRIDE__ = () => { const e = new Error('nf'); e.name = 'BlobNotFoundError'; throw e; };
    const res = await uploadPost(mgr('u-023'), { action: 'delete', url: newUrl('u-999') }); // 他人的新格式路徑
    assert.equal(res.status, 403, 'ownership 檢查必須先於 NotFound 冪等');
    assert.equal(ctx.dels().length, 0);
  });
});

// minor #2：legacy gallery 端到端（讀 server photoGalleries）
test('minor2) legacy gallery：自己旗下 escort 且 URL 精確在 photoGalleries → 200 del1；跨 manager／不在紀錄／相似 → 403 del0', { skip }, async () => {
  const urlA = legacyUrl('esc-gal');            // avatars/esc-gal-1699999999.jpg（存進本人 escort 的相簿）
  const urlSimilar = `https://${HOST}/avatars/esc-gal-1700000001.jpg`; // owner 相同但不在相簿（相似但不同）
  const urlB = legacyUrl('esc-galB');           // 別的 manager 旗下 escort 的圖
  await syncStore.mergeShared({
    escorts: [
      { id: 'esc-gal', managerId: 'u-023', nickname: 'g', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'esc-galB', managerId: 'u-999', nickname: 'gB', createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    photoGalleries: [
      { id: 'esc-gal', urls: [urlA] },
      { id: 'esc-galB', urls: [urlB] },
    ],
  });

  await routeSandbox(BLOB_ON, async (ctx) => {
    const ok = await uploadPost(mgr('u-023'), { action: 'delete', url: urlA });
    assert.equal(ok.status, 200); assert.equal(ctx.dels().length, 1);
  });
  await routeSandbox(BLOB_ON, async (ctx) => {
    const cross = await uploadPost(mgr('u-023'), { action: 'delete', url: urlB }); // 跨 manager
    assert.equal(cross.status, 403); assert.equal(ctx.dels().length, 0);
  });
  await routeSandbox(BLOB_ON, async (ctx) => {
    const notInRec = await uploadPost(mgr('u-023'), { action: 'delete', url: urlSimilar }); // owner 本人管理但 URL 不在相簿（相似）
    assert.equal(notInRec.status, 403); assert.equal(ctx.dels().length, 0);
  });
});

// minor #3：已刪除/不存在帳號持舊 session → requireActiveSession 回 401，head/del 均 0
test('minor3) 不存在帳號的 session delete → 401，head 0、del 0', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    const res = await uploadPost({ userId: 'u-ghost-deleted', role: 'manager', tier: 'vip' },
      { action: 'delete', url: newUrl('u-ghost-deleted') });
    assert.equal(res.status, 401);
    assert.equal(ctx.heads().length, 0, 'requireActiveSession 應在 head 之前擋下');
    assert.equal(ctx.dels().length, 0);
  });
});
