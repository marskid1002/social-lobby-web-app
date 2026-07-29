// D 測試：聊天室成員授權 + 封鎖 + 過期 + append-only。
// 直接載入 production：chat-authz 純函式、sync-authz.authorizeWrites（寫入）、route.scopeForSession（讀取）、
// route.POST（整合）。不複製授權邏輯。純函式/scope 測試無 I/O；route 測試僅記憶體 fallback（有 Redis env 則跳過）。
//
// 執行：node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/chat-authz.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const chat = await import('@/lib/chat-authz');
const { canonicalThreadId, buildChatAccessIndex, canWriteChatMessage, canReadChatThread, activeBlockPeers } = chat;
const { authorizeWrites, buildIndex } = await import('@/lib/sync-authz');
const { scopeForSession, POST } = await import('@/app/api/sync/route');
const { signSession } = await import('@/lib/session');
const store = await import('@/lib/sync-store');
const authStore = await import('@/lib/auth-store');

const NOW = Date.parse('2026-06-01T00:00:00.000Z');
const CA = '2026-01-01T00:00:00.000Z';
const FE = '2999-01-01T00:00:00.000Z'; // 未過期
const PE = '2020-01-01T00:00:00.000Z'; // 已過期
const usr = (id) => ({ userId: id, role: 'user', tier: 'standard' });
const mgr = (id) => ({ userId: id, role: 'manager', tier: 'vip' });

// authorizeWrites → 回傳 chatMessages 授權結果的 id 陣列（以固定 NOW 判過期）
const Wids = (patch, session, cols = {}, now = NOW) =>
  (authorizeWrites(patch, session, buildIndex(cols), now).chatMessages ?? []).map((m) => m.id);
const Wout = (patch, session, cols = {}, now = NOW) =>
  authorizeWrites(patch, session, buildIndex(cols), now).chatMessages ?? [];

// scopeForSession → 回傳可讀 chatMessages 的 id 陣列
const emptyAll = () => ({
  requests: [], responses: [], invitations: [], updates: [], chatMessages: [],
  presence: [], photoOverrides: [], photoGalleries: [], registeredUsers: [], blocks: [], escorts: [],
  momentPosts: [], plazaComments: [],
});
const Rids = (all, session) => scopeForSession({ ...emptyAll(), ...all }, session).chatMessages.map((m) => m.id);

const cm = (id, threadId, senderId, extra = {}) => ({ id, threadId, senderId, text: 't', createdAt: CA, ...extra });
// 一則已接受、未過期的 1:1 invitation（定義 a-b 聊天室）
const inv = (id, from, to, extra = {}) => ({ id, fromUserId: from, toUserId: to, requestId: null, status: 'accepted', chatExpiresAt: FE, createdAt: CA, ...extra });

// ══════════ 純函式：canonicalThreadId / 成員索引 / 子字串碰撞 ══════════
test('canonicalThreadId：排序無關順序（反轉 participant 不產生新 thread）', () => {
  assert.equal(canonicalThreadId('A', 'x'), 'A-x');
  assert.equal(canonicalThreadId('x', 'A'), 'A-x');
  assert.equal(canonicalThreadId('u-010', 'u-02'), 'u-010-u-02');
});

test('buildChatAccessIndex：1:1 成員來自 invitation 兩端；非參與者不得成員', () => {
  const invs = [inv('iv', 'A', 'B')];
  const aA = buildChatAccessIndex('A', { invitations: invs });
  assert.equal(aA.direct.get('A-B'), 'B');
  const aC = buildChatAccessIndex('C', { invitations: invs });
  assert.equal(aC.direct.has('A-B'), false); // 第三人不是成員
});

test('子字串碰撞：u-01 不得命中只屬於 u-010 的聊天室（讀與寫皆然）', () => {
  // 只有 (u-010, u-02) 的 invitation → thread u-010-u-02
  const invs = [inv('iv', 'u-010', 'u-02')];
  const msg = cm('m', 'u-010-u-02', 'u-010');
  // 讀：u-01 不得看到 u-010 的訊息（舊 includes 會誤放行）
  assert.deepEqual(Rids({ invitations: invs, chatMessages: [msg] }, usr('u-01')), []);
  // 讀：真正成員 u-010 可看到
  assert.deepEqual(Rids({ invitations: invs, chatMessages: [msg] }, usr('u-010')), ['m']);
  // 寫：u-01 寫入 u-010 的 thread → 丟棄
  assert.deepEqual(Wids({ chatMessages: [cm('x', 'u-010-u-02', 'u-01')] }, usr('u-01'), { invitations: invs }), []);
});

// ══════════ 寫入授權（authorizeWrites）══════════
test('1) 合法 1:1 雙方可寫；senderId===me', () => {
  const cols = { invitations: [inv('iv', 'A', 'B')] };
  assert.deepEqual(Wids({ chatMessages: [cm('m', 'A-B', 'A')] }, usr('A'), cols), ['m']);
  assert.deepEqual(Wids({ chatMessages: [cm('m', 'A-B', 'B')] }, usr('B'), cols), ['m']);
});

test('2/4) threadId 屬他人（非成員）即使 senderId===session 仍被拒；第三人不能寫', () => {
  const cols = { invitations: [inv('iv', 'A', 'B')] };
  // 第三人 C 猜到 A-B → 丟棄
  assert.deepEqual(Wids({ chatMessages: [cm('m', 'A-B', 'C')] }, usr('C'), cols), []);
  // C 對「不存在關係」的 thread（senderId===C）→ 丟棄
  assert.deepEqual(Wids({ chatMessages: [cm('m', 'C-D', 'C')] }, usr('C'), cols), []);
});

test('3) senderId 偽造成聊天室成員 → 丟棄（senderId 必等於 session）', () => {
  const cols = { invitations: [inv('iv', 'A', 'B')] };
  // 攻擊者 E 冒充 senderId=A 寫入 A-B → senderId≠session(E) → 丟棄
  assert.deepEqual(Wids({ chatMessages: [cm('m', 'A-B', 'A')] }, usr('E'), cols), []);
});

test('7) 既有 message id append-only：不得覆寫 senderId/threadId/text/createdAt/imageUrl', () => {
  const cols = {
    invitations: [inv('iv', 'A', 'B')],
    chatMessages: [cm('m1', 'A-B', 'A', { text: 'orig', imageUrl: 'u1', createdAt: CA })],
  };
  const out = Wout({ chatMessages: [{ id: 'm1', threadId: 'HACK', senderId: 'A', text: 'HACKED', imageUrl: 'evil', createdAt: '2099-01-01T00:00:00.000Z' }] }, usr('A'), cols);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], cols.chatMessages[0]); // 一律沿用 server 版（凍結）
});

test('8/9) 同批合法+非法：只丟非法，合法照留（full-snapshot 不整批失敗）', () => {
  const cols = { invitations: [inv('iv', 'A', 'B')] };
  const out = Wids({ chatMessages: [
    cm('ok', 'A-B', 'A'),          // 合法
    cm('bad1', 'A-B', 'X'),        // senderId≠me
    cm('bad2', 'C-D', 'A'),        // 非成員 thread
    cm('ok2', 'A-B', 'A'),         // 合法
  ] }, usr('A'), cols);
  assert.deepEqual(out.sort(), ['ok', 'ok2']);
});

test('10/12) active block：1:1 雙方都不能寫；反轉順序/新 threadId 不能繞過', () => {
  const cols = {
    invitations: [inv('iv', 'A', 'B')],
    blocks: [{ id: 'A__B', blockerId: 'A', blockedId: 'B', active: true, createdAt: CA }],
  };
  assert.deepEqual(Wids({ chatMessages: [cm('m', 'A-B', 'A')] }, usr('A'), cols), []); // A 被擋
  assert.deepEqual(Wids({ chatMessages: [cm('m', 'B-A', 'B')] }, usr('B'), cols), []); // 反轉順序仍是 A-B → 擋（且 B-A 非成員）
  assert.deepEqual(Wids({ chatMessages: [cm('m', 'A-B', 'B')] }, usr('B'), cols), []); // 另一方 B 也被擋（雙向）
});

test('11) 解除封鎖（active:false）後，原合法雙方可重新傳訊', () => {
  const cols = {
    invitations: [inv('iv', 'A', 'B')],
    blocks: [{ id: 'A__B', blockerId: 'A', blockedId: 'B', active: false, createdAt: CA }],
  };
  assert.deepEqual(Wids({ chatMessages: [cm('m', 'A-B', 'A')] }, usr('A'), cols), ['m']);
  assert.deepEqual(Wids({ chatMessages: [cm('m', 'A-B', 'B')] }, usr('B'), cols), ['m']);
});

test('13/14) 群組：成員可寫、非成員不可；群組內單一 block 不誤殺整團', () => {
  const cols = {
    requests: [{ id: 'r1', creatorId: 'C', createdAt: CA }],
    responses: [{ id: 'rr1', requestId: 'r1', userId: 'g1', responseStatus: 'joining', createdAt: CA }],
    // C 與 g1 互相封鎖，但群組不受影響
    blocks: [{ id: 'C__g1', blockerId: 'C', blockedId: 'g1', active: true, createdAt: CA }],
  };
  assert.deepEqual(Wids({ chatMessages: [cm('m', 'g-r1', 'C')] }, usr('C'), cols), ['m']);   // creator 成員（有 block 仍可寫群組）
  assert.deepEqual(Wids({ chatMessages: [cm('m', 'g-r1', 'g1')] }, usr('g1'), cols), ['m']); // joining 成員
  assert.deepEqual(Wids({ chatMessages: [cm('m', 'g-r1', 'z9')] }, usr('z9'), cols), []);    // 非成員
});

test('15/16) 派工→接受→代談：幹部/客戶可寫；其他幹部不能寫別人的代談', () => {
  // 代談 invitation：from=幹部 u-501、to=客戶 C、dispatcherId=u-501、accepted
  const cols = {
    requests: [{ id: 'r1', creatorId: 'C', createdAt: CA }],
    responses: [{ id: 'd1', requestId: 'r1', userId: 'girlA', dispatcherId: 'u-501', responseStatus: 'joining', createdAt: CA }],
    invitations: [{ id: 'iv', fromUserId: 'u-501', toUserId: 'C', requestId: 'r1', dispatcherId: 'u-501', status: 'accepted', chatExpiresAt: FE, createdAt: CA }],
  };
  const tid = canonicalThreadId('u-501', 'C');
  assert.deepEqual(Wids({ chatMessages: [cm('m', tid, 'u-501')] }, mgr('u-501'), cols), ['m']); // 代談幹部可寫
  assert.deepEqual(Wids({ chatMessages: [cm('m', tid, 'C')] }, usr('C'), cols), ['m']);         // 客戶可寫
  assert.deepEqual(Wids({ chatMessages: [cm('m', tid, 'u-999')] }, mgr('u-999'), cols), []);    // 其他幹部非成員 → 丟棄
});

test('17) 過期聊天室：禁止新寫入，但歷史仍可讀', () => {
  const expiredInv = [inv('iv', 'A', 'B', { chatExpiresAt: PE })];
  // 寫：過期 → 丟棄
  assert.deepEqual(Wids({ chatMessages: [cm('m', 'A-B', 'A')] }, usr('A'), { invitations: expiredInv }), []);
  // 讀：歷史仍下發（讀取端不套用 writable/過期）
  assert.deepEqual(Rids({ invitations: expiredInv, chatMessages: [cm('old', 'A-B', 'A')] }, usr('A')), ['old']);
});

test('17b) 未接受(pending)的 invitation：不能寫，但成員仍可讀歷史', () => {
  const pend = [inv('iv', 'A', 'B', { status: 'pending' })];
  assert.deepEqual(Wids({ chatMessages: [cm('m', 'A-B', 'A')] }, usr('A'), { invitations: pend }), []);
  assert.deepEqual(Rids({ invitations: pend, chatMessages: [cm('old', 'A-B', 'A')] }, usr('A')), ['old']);
});

// ══════════ 讀取（scopeForSession）══════════
test('1-read) 合法 1:1 雙方可讀；第三人不可讀', () => {
  const all = { invitations: [inv('iv', 'A', 'B')], chatMessages: [cm('m', 'A-B', 'A')] };
  assert.deepEqual(Rids(all, usr('A')), ['m']);
  assert.deepEqual(Rids(all, usr('B')), ['m']);
  assert.deepEqual(Rids(all, usr('C')), []);
});

test('13-read) 群組成員可讀，非成員不可讀', () => {
  const all = {
    requests: [{ id: 'r1', creatorId: 'C', createdAt: CA }],
    responses: [{ id: 'rr1', requestId: 'r1', userId: 'g1', responseStatus: 'joining', createdAt: CA }],
    chatMessages: [cm('m', 'g-r1', 'C')],
  };
  assert.deepEqual(Rids(all, usr('C')), ['m']);
  assert.deepEqual(Rids(all, usr('g1')), ['m']);
  assert.deepEqual(Rids(all, usr('z9')), []);
});

test('6) malformed / null / 空 / 未知 threadId：不拋例外、該筆不下發', () => {
  const all = {
    invitations: [inv('iv', 'A', 'B')],
    chatMessages: [
      cm('good', 'A-B', 'A'),
      { id: 'n1', threadId: null, senderId: 'A', text: 't', createdAt: CA },
      { id: 'n2', threadId: '', senderId: 'A', text: 't', createdAt: CA },
      { id: 'n3', threadId: 123, senderId: 'A', text: 't', createdAt: CA },
      { id: 'n4', senderId: 'A', text: 't', createdAt: CA },              // 無 threadId
      { id: 'n5', threadId: 'unknown-thread', senderId: 'A', text: 't', createdAt: CA }, // 未知關係
      null, 'str', 42,
    ],
  };
  let out;
  assert.doesNotThrow(() => { out = Rids(all, usr('A')); });
  assert.deepEqual(out, ['good']); // 只有合法成員訊息下發，其餘全不下發、且不拋例外
});

test('5-read) senderId 不是讀取權證：偽造 senderId 不能取得聊天室內容', () => {
  // 攻擊者 C 不是 A-B 成員；即使有一筆 senderId=C 的訊息落在 A-B thread，C 讀 A-B 仍取不到
  const all = { invitations: [inv('iv', 'A', 'B')], chatMessages: [cm('m', 'A-B', 'C')] };
  assert.deepEqual(Rids(all, usr('C')), []); // C 非成員 → 讀不到（senderId=C 不構成讀取權）
});

test('activeBlockPeers：雙向且 active !== false', () => {
  const blocks = [
    { id: '1', blockerId: 'A', blockedId: 'B', active: true },
    { id: '2', blockerId: 'X', blockedId: 'A', active: true },
    { id: '3', blockerId: 'A', blockedId: 'C', active: false }, // 已解除
  ];
  const s = activeBlockPeers('A', blocks);
  assert.equal(s.has('B'), true); assert.equal(s.has('X'), true); assert.equal(s.has('C'), false);
});

// ══════════ 路由整合（POST；記憶體 fallback）══════════
const REDIS = !!(process.env.KV_REST_API_URL || process.env.KV_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL);
const skip = REDIS ? '偵測到 Redis 環境變數：跳過 route 整合測試以免碰 production' : false;
let ipSeq = 0;
async function post(session, patch) {
  const token = await signSession(session);
  return POST(new Request('http://localhost/api/sync', {
    method: 'POST',
    headers: { cookie: `sl_session=${encodeURIComponent(token)}`, 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.' + (ipSeq++ % 200) },
    body: JSON.stringify({ patch }),
  }));
}

test('18) guest POST chatMessages → 403，且未寫入 store', { skip }, async () => {
  await store.clearShared();
  const res = await post({ userId: 'u-099', role: 'guest', tier: 'guest' }, { chatMessages: [cm('g', 'A-B', 'u-099')] });
  assert.equal(res.status, 403);
  assert.equal((await store.getCollection('chatMessages')).length, 0);
});

test('19) 帳號不存在（已刪除）session → 401，且無寫入副作用', { skip }, async () => {
  await store.clearShared();
  const res = await post(usr('c-nonexistent-deleted'), { chatMessages: [cm('d', 'A-B', 'c-nonexistent-deleted')] });
  assert.ok(res.status === 401 || res.status === 403, `expected 401/403, got ${res.status}`);
  assert.equal((await store.getCollection('chatMessages')).length, 0);
});

test('9/20) full-snapshot：大量外來/非成員 chatMessages → 200，未授權皆不進 mergeShared', { skip }, async () => {
  const c = (await authStore.createCustomer('0977000001', 'Pw!23456', 'c')).userId;
  await store.clearShared();
  // 500 筆 senderId===本人但 threadId 皆非成員關係 → 全部應被丟棄；且回 200（非整批 400）
  const many = Array.from({ length: 500 }, (_, i) => cm(`f${i}`, `no-rel-${i}`, c));
  const res = await post(usr(c), { chatMessages: many });
  assert.equal(res.status, 200);
  assert.equal((await store.getCollection('chatMessages')).length, 0);
});

test('1-route) 合法 1:1：先建 accepted invitation，雙方寫入皆進 store', { skip }, async () => {
  const a = (await authStore.createCustomer('0977000002', 'Pw!23456', 'a')).userId;
  const b = (await authStore.createCustomer('0977000003', 'Pw!23456', 'b')).userId;
  await store.clearShared();
  const tid = canonicalThreadId(a, b);
  // a 送出私人邀請（pending）→ b 接受（accepted）
  await post(usr(a), { invitations: [{ id: 'iv1', fromUserId: a, toUserId: b, requestId: null, status: 'pending', createdAt: CA }] });
  await post(usr(b), { invitations: [{ id: 'iv1', status: 'accepted', respondedAt: CA, chatExpiresAt: FE }] });
  const ir = (await store.getCollection('invitations'))[0];
  assert.ok(ir && ir.status === 'accepted');
  // 雙方各寫一則 → 皆進 store；第三人 stranger 寫入 → 不進
  await post(usr(a), { chatMessages: [cm('ma', tid, a)] });
  await post(usr(b), { chatMessages: [cm('mb', tid, b)] });
  const strangerC = (await authStore.createCustomer('0977000009', 'Pw!23456', 'x')).userId;
  await post(usr(strangerC), { chatMessages: [cm('mx', tid, strangerC)] });
  const cmsgs = (await store.getCollection('chatMessages')).map((m) => m.id).sort();
  assert.deepEqual(cmsgs, ['ma', 'mb']);
});

test('10-route) active block 後：1:1 雙方新訊息都不進 store', { skip }, async () => {
  const a = (await authStore.createCustomer('0977000004', 'Pw!23456', 'a')).userId;
  const b = (await authStore.createCustomer('0977000005', 'Pw!23456', 'b')).userId;
  await store.clearShared();
  const tid = canonicalThreadId(a, b);
  await store.mergeShared({ invitations: [{ id: 'iv', fromUserId: a, toUserId: b, requestId: null, status: 'accepted', chatExpiresAt: FE, createdAt: CA }] });
  // a 封鎖 b
  await post(usr(a), { blocks: [{ id: `${a}__${b}`, blockerId: a, blockedId: b, active: true, createdAt: CA }] });
  await post(usr(a), { chatMessages: [cm('ma', tid, a)] });
  await post(usr(b), { chatMessages: [cm('mb', tid, b)] });
  assert.equal((await store.getCollection('chatMessages')).length, 0); // 雙方皆被擋
  // a 解封（送完整 block 物件，與 production unblockUser 一致）→ 可重新傳
  await post(usr(a), { blocks: [{ id: `${a}__${b}`, blockerId: a, blockedId: b, active: false, createdAt: CA }] });
  await post(usr(a), { chatMessages: [cm('ma2', tid, a)] });
  assert.deepEqual((await store.getCollection('chatMessages')).map((m) => m.id), ['ma2']);
});
