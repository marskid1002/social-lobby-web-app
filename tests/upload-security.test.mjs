// H1 測試：圖片上傳格式/內容/大小/Blob pathname 防護。
// 載入「真正的」production 純函式（image-upload.ts）與 /api/upload 的 POST；@vercel/blob 由 loader 換成
// tests/blob-stub.mjs（不連真實 Blob）。不連真實 Redis（沙盒清空 Redis env → 記憶體 fallback）。
//
// 執行：node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/upload-security.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const iu = await import('@/lib/image-upload');
const { signSession } = await import('@/lib/session');
const authStore = await import('@/lib/auth-store');

const REDIS = !!(process.env.KV_REST_API_URL || process.env.KV_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL);
const skip = REDIS ? '偵測到 Redis 環境變數：跳過會用到帳號儲存的 route 測試以免污染' : false;

// ── 影像建構工具 ─────────────────────────────────────────────────────────────
const toB64 = (bytes) => Buffer.from(bytes).toString('base64');
const dataUrl = (mime, bytes) => `data:${mime};base64,${toB64(bytes)}`;
const JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]; // FF D8 FF ...
const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
const WEBP_BYTES = [0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x00, 0x00]; // RIFF....WEBP..
const GIF_BYTES = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00]; // GIF89a
const JPEG_DATA_URL = dataUrl('image/jpeg', JPEG_BYTES);

// ══ 純驗證（H1 十二.1~十二.18）══════════════════════════════════════════════

test('1) 合法 JPEG MIME+magic → 通過（ext=jpg）', () => {
  const r = iu.parseAndValidateImageDataUrl(dataUrl('image/jpeg', JPEG_BYTES));
  assert.equal(r.ok, true); assert.equal(r.mime, 'image/jpeg'); assert.equal(r.ext, 'jpg');
});
test('2) 合法 PNG signature → 通過（ext=png）', () => {
  const r = iu.parseAndValidateImageDataUrl(dataUrl('image/png', PNG_BYTES));
  assert.equal(r.ok, true); assert.equal(r.ext, 'png');
});
test('3) 合法 WEBP RIFF/WEBP → 通過（ext=webp）', () => {
  const r = iu.parseAndValidateImageDataUrl(dataUrl('image/webp', WEBP_BYTES));
  assert.equal(r.ok, true); assert.equal(r.ext, 'webp');
});
test('4) SVG → 400', () => {
  const r = iu.parseAndValidateImageDataUrl(dataUrl('image/svg+xml', [0x3c, 0x73, 0x76, 0x67]));
  assert.equal(r.ok, false); assert.equal(r.status, 400);
});
test('5) HTML → 400', () => {
  assert.equal(iu.parseAndValidateImageDataUrl(dataUrl('text/html', [0x3c, 0x68])).ok, false);
});
test('6) GIF → 400', () => {
  assert.equal(iu.parseAndValidateImageDataUrl(dataUrl('image/gif', GIF_BYTES)).ok, false);
});
test('7) application/octet-stream → 400', () => {
  assert.equal(iu.parseAndValidateImageDataUrl(dataUrl('application/octet-stream', JPEG_BYTES)).ok, false);
});
test('8) MIME 缺失/未知 → 400', () => {
  assert.equal(iu.parseAndValidateImageDataUrl('data:;base64,' + toB64(JPEG_BYTES)).ok, false);
  assert.equal(iu.parseAndValidateImageDataUrl(dataUrl('image/tiff', JPEG_BYTES)).ok, false);
  assert.equal(iu.parseAndValidateImageDataUrl(dataUrl('image/heic', JPEG_BYTES)).ok, false);
});
test('9) JPEG MIME + PNG bytes → 400（magic 不符）', () => {
  const r = iu.parseAndValidateImageDataUrl(dataUrl('image/jpeg', PNG_BYTES));
  assert.equal(r.ok, false); assert.equal(r.status, 400);
});
test('10) PNG MIME + JPEG bytes → 400', () => {
  assert.equal(iu.parseAndValidateImageDataUrl(dataUrl('image/png', JPEG_BYTES)).ok, false);
});
test('11) WEBP MIME + 錯誤 magic → 400（RIFF 但非 WEBP / 太短）', () => {
  const riffNotWebp = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x58, 0x58, 0x58, 0x58, 0, 0];
  assert.equal(iu.parseAndValidateImageDataUrl(dataUrl('image/webp', riffNotWebp)).ok, false);
  assert.equal(iu.parseAndValidateImageDataUrl(dataUrl('image/webp', [0x52, 0x49, 0x46, 0x46])).ok, false); // 太短(<12)
});
test('12) null / 非字串 / 空字串 → 400', () => {
  assert.equal(iu.parseAndValidateImageDataUrl(null).ok, false);
  assert.equal(iu.parseAndValidateImageDataUrl(undefined).ok, false);
  assert.equal(iu.parseAndValidateImageDataUrl(12345).ok, false);
  assert.equal(iu.parseAndValidateImageDataUrl('').ok, false);
});
test('13) 非 Data URL → 400', () => {
  assert.equal(iu.parseAndValidateImageDataUrl('not-a-data-url').ok, false);
  assert.equal(iu.parseAndValidateImageDataUrl('data:image/jpeg;base64,@@@@').ok, false);
});
test('14) base64 含非法字元 → 400', () => {
  assert.equal(iu.parseAndValidateImageDataUrl('data:image/jpeg;base64,' + toB64(JPEG_BYTES) + '$$$').ok, false);
  assert.equal(iu.parseAndValidateImageDataUrl('data:image/jpeg;charset=utf-8;base64,' + toB64(JPEG_BYTES)).ok, false); // 額外 param
});
test('15) 空 decoded buffer → 400', () => {
  assert.equal(iu.parseAndValidateImageDataUrl('data:image/jpeg;base64,A').ok, false); // 不足以組成 1 byte
});
test('16) decoded bytes 正好等於上限 → 接受', () => {
  const buf = Buffer.alloc(iu.MAX_IMAGE_BYTES); buf[0] = 0xff; buf[1] = 0xd8; buf[2] = 0xff;
  const r = iu.parseAndValidateImageDataUrl('data:image/jpeg;base64,' + buf.toString('base64'));
  assert.equal(r.ok, true); assert.equal(r.buffer.length, iu.MAX_IMAGE_BYTES);
});
test('17) decoded bytes 超過上限 1 byte → 413', () => {
  const buf = Buffer.alloc(iu.MAX_IMAGE_BYTES + 1); buf[0] = 0xff; buf[1] = 0xd8; buf[2] = 0xff;
  const r = iu.parseAndValidateImageDataUrl('data:image/jpeg;base64,' + buf.toString('base64'));
  assert.equal(r.ok, false); assert.equal(r.status, 413);
});
test('18) encoded payload 病態超長 → decode 前 413', () => {
  const huge = 'data:image/jpeg;base64,' + 'A'.repeat(iu.MAX_ENCODED_B64_LEN + 8);
  const r = iu.parseAndValidateImageDataUrl(huge);
  assert.equal(r.ok, false); assert.equal(r.status, 413);
});

// ── pathname / kind / userId 正規化（純函式）──────────────────────────────────

test('pathname：格式、白名單 kind、UUID、副檔名', () => {
  const p = iu.buildUploadPathname('u-018', 'avatar', 'jpg', '11111111-2222-3333-4444-555555555555');
  assert.equal(p, 'uploads/u-018/avatar/11111111-2222-3333-4444-555555555555.jpg');
});
test('safeUserSegment：清掉 ../ 與 / ；空值退回 user', () => {
  assert.equal(iu.safeUserSegment('../../victim'), 'victim');
  assert.equal(iu.safeUserSegment('chat/../../../x'), 'chatx');
  assert.equal(iu.safeUserSegment('/admin'), 'admin');
  assert.equal(iu.safeUserSegment('c-abc-123'), 'c-abc-123');
  assert.equal(iu.safeUserSegment(''), 'user');
  assert.equal(iu.safeUserSegment(undefined), 'user');
});
test('safeKind：白名單保留，未知/含 ../ 正規化為 image', () => {
  assert.equal(iu.safeKind('chat'), 'chat');
  assert.equal(iu.safeKind('managed-photo'), 'managed-photo');
  assert.equal(iu.safeKind(undefined), 'image');
  assert.equal(iu.safeKind('../../admin'), 'image');
  assert.equal(iu.safeKind('a/b'), 'image');
});

// ══ Route / Blob（H1 十二.19~十二.34）══════════════════════════════════════

const ENV_KEYS = ['NODE_ENV', 'VERCEL_ENV', 'BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID', 'SESSION_SECRET',
  'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'REDIS_URL', 'KV_URL'];
function snapshotEnv() { const s = {}; for (const k of ENV_KEYS) s[k] = process.env[k]; return s; }
function restoreEnv(s) { for (const k of ENV_KEYS) { if (s[k] === undefined) delete process.env[k]; else process.env[k] = s[k]; } }

async function routeSandbox(overrides, fn) {
  const snap = snapshotEnv();
  const origLog = console.log, origErr = console.error;
  console.log = () => {}; console.error = () => {};
  globalThis.__BLOB_PUT_CALLS__ = []; globalThis.__BLOB_DEL_CALLS__ = [];
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(overrides)) if (v !== undefined) process.env[k] = v;
  try { return await fn({ puts: () => globalThis.__BLOB_PUT_CALLS__, dels: () => globalThis.__BLOB_DEL_CALLS__ }); }
  finally { console.log = origLog; console.error = origErr; restoreEnv(snap); }
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
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\./;
const BLOB_ON = { BLOB_READ_WRITE_TOKEN: 'test-token' }; // dev + blob 可用（stub）

test('19) guest → 403，沒有 put', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    const res = await uploadPost({ userId: 'u-099', role: 'guest', tier: 'free' }, { userId: 'chat', dataUrl: JPEG_DATA_URL });
    assert.equal(res.status, 403);
    assert.equal(ctx.puts().length, 0);
  });
});

test('20) disabled 帳號 → 403，沒有 put', { skip }, async () => {
  await authStore.getAccount('A001'); // 先觸發 ensureManagerAccounts（seed A001→u-018），再停用
  assert.equal(await authStore.setAccountDisabled('A001', true), true); // u-018 停用
  try {
    await routeSandbox(BLOB_ON, async (ctx) => {
      const res = await uploadPost(mgr('u-018'), { userId: 'chat', dataUrl: JPEG_DATA_URL });
      assert.equal(res.status, 403);
      assert.equal(ctx.puts().length, 0);
    });
  } finally { await authStore.setAccountDisabled('A001', false); }
});

test('21/22/23/24/26) 正常帳號合法 JPEG → put 一次、contentType/副檔名/UUID/安全 userId', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    const res = await uploadPost(mgr('u-023'), { userId: 'chat', dataUrl: JPEG_DATA_URL });
    assert.equal(res.status, 200);
    assert.ok(String(res.body.url).includes('blob.vercel-storage.com'));
    assert.equal(ctx.puts().length, 1);
    const call = ctx.puts()[0];
    assert.equal(call.contentType, 'image/jpeg');
    assert.ok(call.pathname.startsWith('uploads/u-023/'), 'pathname 必含安全化 session.userId');
    assert.ok(call.pathname.endsWith('.jpg'), '副檔名須為 jpg');
    assert.ok(UUID_RE.test(call.pathname), 'pathname 須含 UUID');
  });
});

test('22/23) PNG/WEBP 的 contentType 與副檔名正確', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    let res = await uploadPost(mgr('u-023'), { dataUrl: dataUrl('image/png', PNG_BYTES) });
    assert.equal(res.status, 200);
    assert.equal(ctx.puts().at(-1).contentType, 'image/png');
    assert.ok(ctx.puts().at(-1).pathname.endsWith('.png'));
    res = await uploadPost(mgr('u-023'), { dataUrl: dataUrl('image/webp', WEBP_BYTES) });
    assert.equal(res.status, 200);
    assert.equal(ctx.puts().at(-1).contentType, 'image/webp');
    assert.ok(ctx.puts().at(-1).pathname.endsWith('.webp'));
  });
});

test('25) pathname 含白名單 kind（含缺省 image）', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    await uploadPost(mgr('u-023'), { dataUrl: JPEG_DATA_URL, kind: 'avatar' });
    assert.ok(ctx.puts().at(-1).pathname.startsWith('uploads/u-023/avatar/'));
    await uploadPost(mgr('u-023'), { dataUrl: JPEG_DATA_URL }); // 無 kind → image
    assert.ok(ctx.puts().at(-1).pathname.startsWith('uploads/u-023/image/'));
  });
});

test('27) client userId="../../victim" 不得出現在 pathname', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    const res = await uploadPost(mgr('u-023'), { userId: '../../victim', dataUrl: JPEG_DATA_URL });
    assert.equal(res.status, 200);
    const p = ctx.puts().at(-1).pathname;
    assert.ok(p.startsWith('uploads/u-023/'), 'pathname 只能用 session.userId');
    assert.ok(!p.includes('victim') && !p.includes('..'), 'client userId 不得進 pathname');
  });
});

test('28) kind="../../admin" 不得出現在 pathname（正規化為 image）', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    const res = await uploadPost(mgr('u-023'), { dataUrl: JPEG_DATA_URL, kind: '../../admin' });
    assert.equal(res.status, 200);
    const p = ctx.puts().at(-1).pathname;
    assert.ok(p.startsWith('uploads/u-023/image/'));
    assert.ok(!p.includes('admin') && !p.includes('..'));
  });
});

test('29) 非法 MIME/magic/超大 → 不呼叫 put', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    assert.equal((await uploadPost(mgr('u-023'), { dataUrl: dataUrl('image/svg+xml', [0x3c]) })).status, 400);
    assert.equal((await uploadPost(mgr('u-023'), { dataUrl: dataUrl('image/jpeg', PNG_BYTES) })).status, 400);
    const big = Buffer.alloc(iu.MAX_IMAGE_BYTES + 1); big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
    assert.equal((await uploadPost(mgr('u-023'), { dataUrl: 'data:image/jpeg;base64,' + big.toString('base64') })).status, 413);
    assert.equal(ctx.puts().length, 0, '非法內容不得呼叫 put');
  });
});

test('30) manager 傳現有 girlId payload + 合法 JPEG → 仍可上傳（路徑用 manager session）', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    const res = await uploadPost(mgr('u-023'), { userId: 'u-501-girl', dataUrl: JPEG_DATA_URL });
    assert.equal(res.status, 200);
    assert.ok(ctx.puts().at(-1).pathname.startsWith('uploads/u-023/'));
    assert.ok(!ctx.puts().at(-1).pathname.includes('u-501-girl'));
  });
});

test('31) chat userId="chat" payload + 合法 JPEG（一般客戶）→ 仍可上傳', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    const acc = await authStore.createCustomer('0988000001', 'pw123456', 'u');
    const res = await uploadPost({ userId: acc.userId, role: 'user', tier: 'standard' }, { userId: 'chat', dataUrl: JPEG_DATA_URL });
    assert.equal(res.status, 200);
    assert.ok(ctx.puts().at(-1).pathname.startsWith(`uploads/${acc.userId}/`));
  });
});

test('32) 本地無 Blob fallback：合法圖片可 fallback；SVG/錯誤 magic 不得 fallback 成功', { skip }, async () => {
  await routeSandbox({}, async (ctx) => { // 無 BLOB env、dev
    const ok = await uploadPost(mgr('u-023'), { dataUrl: JPEG_DATA_URL });
    assert.equal(ok.status, 200); assert.equal(ok.body.fallback, true);
    assert.equal((await uploadPost(mgr('u-023'), { dataUrl: dataUrl('image/svg+xml', [0x3c]) })).status, 400);
    assert.equal((await uploadPost(mgr('u-023'), { dataUrl: dataUrl('image/jpeg', PNG_BYTES) })).status, 400);
    assert.equal(ctx.puts().length, 0);
  });
});

test('33) production 無 Blob → 503', { skip }, async () => {
  await routeSandbox({ NODE_ENV: 'production', SESSION_SECRET: 'x' }, async () => {
    const res = await uploadPost(mgr('u-023'), { dataUrl: JPEG_DATA_URL });
    assert.equal(res.status, 503);
  });
});

test('34) delete action：manager 仍可、非 manager 仍 403（行為不變）', { skip }, async () => {
  await routeSandbox(BLOB_ON, async (ctx) => {
    const del = await uploadPost(mgr('u-023'), { action: 'delete', url: 'https://x.blob.vercel-storage.com/a.png' });
    assert.equal(del.status, 200); assert.equal(del.body.ok, true);
    assert.equal(ctx.dels().length, 1);
    // 非 manager（客戶）刪除 → 403，未增加/放寬權限
    const acc = await authStore.createCustomer('0988000002', 'pw123456', 'u');
    const denied = await uploadPost({ userId: acc.userId, role: 'user', tier: 'standard' }, { action: 'delete', url: 'https://x.blob.vercel-storage.com/a.png' });
    assert.equal(denied.status, 403);
  });
});
