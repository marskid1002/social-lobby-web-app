// 單元測試：直接呼叫「真正的」production scopeForSession / validatePatchShape（不複製邏輯）。
// 驗證修復項 C：污染資料不使 scopeForSession 拋例外、污染項不下發、同批合法項保留；以及寫入 shape 驗證。
//
// 執行方式（不需 dev server；用 Node module hook 載入 route.ts 及相依，零新增套件）：
//   node --test --experimental-transform-types --import ./tests/register-loader.mjs tests/scope-guard.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const route = await import('@/app/api/sync/route');
const { scopeForSession, validatePatchShape } = route;

const SHARED_KEYS = ['requests', 'responses', 'invitations', 'updates', 'chatMessages', 'presence', 'photoOverrides', 'photoGalleries', 'registeredUsers', 'blocks', 'escorts', 'momentPosts', 'plazaComments'];
function emptyShared(over = {}) {
  const s = {};
  for (const k of SHARED_KEYS) s[k] = [];
  return Object.assign(s, over);
}
const session = (id, role = 'user', tier = 'standard') => ({ userId: id, role, tier });
const CA = '2026-01-01T00:00:00.000Z';
const FE = '2999-01-01T00:00:00.000Z'; // 未過期

test('匯入到真正的 production 函式', () => {
  assert.equal(typeof scopeForSession, 'function');
  assert.equal(typeof validatePatchShape, 'function');
});

test('scopeForSession：污染 chatMessages 不拋例外、污染不下發、合法保留', () => {
  const me = 'c-me';
  const all = emptyShared({
    // D：合法可見需真實關係——建立 me↔u-999 的 accepted invitation（thread=c-me-u-999）
    invitations: [{ id: 'iv', fromUserId: me, toUserId: 'u-999', requestId: null, status: 'accepted', chatExpiresAt: FE, createdAt: CA }],
    chatMessages: [
      { id: 'poison-null-thread', threadId: null, senderId: me, text: 'x', createdAt: CA },
      { id: 'poison-undef-thread', senderId: me, text: 'x', createdAt: CA },
      { id: 'poison-num-thread', threadId: 123, senderId: me, text: 'x', createdAt: CA },
      { id: 'poison-null-sender', threadId: `${me}-u-999`, senderId: null, text: 'x', createdAt: CA },
      { id: 'legit', threadId: `${me}-u-999`, senderId: me, text: 'hi', createdAt: CA },
      null,
      'not-an-object',
    ],
  });

  let scoped;
  assert.doesNotThrow(() => { scoped = scopeForSession(all, session(me)); }, '污染資料不得使 scopeForSession 拋例外');
  const ids = scoped.chatMessages.map((m) => m && m.id);
  assert.ok(ids.includes('legit'), '合法 chatMessage 應保留');
  assert.ok(!ids.includes('poison-null-thread'), 'threadId:null 不得下發');
  assert.ok(!ids.includes('poison-undef-thread'), 'threadId 缺失 不得下發');
  assert.ok(!ids.includes('poison-num-thread'), 'threadId 非字串 不得下發');
  assert.ok(!ids.includes('poison-null-sender'), 'senderId:null 不得下發');
});

test('scopeForSession：合法 1:1 與群組 chatMessage 的可見性維持原狀', () => {
  const me = 'c-cust';
  const mgr = 'u-018';
  const reqId = 'req-1';
  const all = emptyShared({
    requests: [{ id: reqId, creatorId: me, area: '信義區', requestType: 'drinking', peopleCount: 1, status: 'open', createdAt: CA }],
    responses: [{ id: 'resp-1', requestId: reqId, userId: 'u-501', dispatcherId: mgr, responseStatus: 'joining', createdAt: CA }],
    // D：代談 1:1 成員以 invitation 兩端為權威（from=幹部 mgr、to=客戶 me）→ thread=canonical(me,mgr)
    invitations: [{ id: 'iv', fromUserId: mgr, toUserId: me, requestId: reqId, dispatcherId: mgr, status: 'accepted', chatExpiresAt: FE, createdAt: CA }],
    chatMessages: [
      { id: 'oneone', threadId: `${me}-${mgr}`, senderId: mgr, text: '代談', createdAt: CA },
      { id: 'group', threadId: `g-${reqId}`, senderId: 'u-501', text: '群組', createdAt: CA },
      { id: 'other', threadId: 'u-777-u-888', senderId: 'u-777', text: '別人的', createdAt: CA },
    ],
  });
  const scoped = scopeForSession(all, session(me));
  const ids = scoped.chatMessages.map((m) => m.id);
  assert.ok(ids.includes('oneone'), '客戶↔幹部 1:1 訊息應可見');
  assert.ok(ids.includes('group'), '客戶為發起人的群組訊息應可見');
  assert.ok(!ids.includes('other'), '與我無關的 1:1 訊息不應可見');
});

test('validatePatchShape：合法通過 / 污染丟棄 / 結構錯 400 / 未知 key 忽略 / 超量 400', () => {
  let r = validatePatchShape({ chatMessages: [{ id: 'a', threadId: 't', senderId: 's', text: 'x', createdAt: CA }] });
  assert.equal(r.ok, true); assert.equal(r.patch.chatMessages.length, 1);

  r = validatePatchShape({ chatMessages: [{ id: 'b', threadId: null, senderId: 's', text: 'x', createdAt: CA }] });
  assert.equal(r.ok, true); assert.equal(r.patch.chatMessages.length, 0, 'threadId:null 應被丟棄');

  r = validatePatchShape({ chatMessages: [{ id: 'c', threadId: 't', senderId: 's', text: 'x', createdAt: 'nope' }] });
  assert.equal(r.patch.chatMessages.length, 0, 'createdAt 無效應被丟棄');

  r = validatePatchShape({ requests: [{ id: '' }, { id: 'ok' }] });
  assert.equal(r.patch.requests.length, 1, 'id 空字串應被丟棄、合法保留');

  r = validatePatchShape({ chatMessages: 'x' });
  assert.equal(r.ok, false, 'collection 非陣列 → 400');

  r = validatePatchShape([]);
  assert.equal(r.ok, false, 'patch 為陣列 → 400');
  r = validatePatchShape(null);
  assert.equal(r.ok, false, 'patch 為 null → 400');

  r = validatePatchShape({ nope: [{ id: 'x' }] });
  assert.equal(r.ok, true); assert.equal(Object.keys(r.patch).length, 0, '未知 collection key 忽略、不存');

  r = validatePatchShape({ requests: Array.from({ length: 20001 }, (_, i) => ({ id: 'r' + i })) });
  assert.equal(r.ok, false, '超過 20000 上限 → 400');

  // 20000 筆（含 foreign 項）仍應通過 → 不因全站快照大小整批 400
  r = validatePatchShape({ requests: Array.from({ length: 20000 }, (_, i) => ({ id: 'r' + i })) });
  assert.equal(r.ok, true, '達上限（含快照/外來項）仍應通過');
});
