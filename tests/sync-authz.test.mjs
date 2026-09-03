// B 單元測試：/api/sync 物件層級寫入授權。直接載入 production authorizeWrites / buildIndex（不複製邏輯）。
// 純函式、無 I/O：以 buildIndex 由「server 既有集合陣列＋幹部名單」建 index，再驗過濾/凍結/transition 結果。
//
// 執行：node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/sync-authz.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const { authorizeWrites, buildIndex } = await import('@/lib/sync-authz');

const mgr = (id) => ({ userId: id, role: 'manager', tier: 'vip' });
const usr = (id) => ({ userId: id, role: 'user', tier: 'standard' });
const CA = '2026-01-01T00:00:00.000Z';
const NOW = Date.parse('2026-06-01T00:00:00.000Z');
const ACCEPTED_AT = new Date(NOW).toISOString();
const CHAT_EXPIRES_AT = new Date(NOW + 48 * 60 * 60 * 1000).toISOString();
const run = (patch, session, cols = {}, managers = []) =>
  authorizeWrites(patch, session, buildIndex(cols, managers), NOW);
const ids = (arr) => (arr ?? []).map((x) => x.id);
const one = (arr) => { assert.equal((arr ?? []).length, 1); return arr[0]; };

// ══ escorts（M1 / A）══
test('escorts create：A/B 不同 id 相同 nickname 皆成功；非本人/非 manager 丟棄', () => {
  assert.deepEqual(ids(run({ escorts: [{ id: 'esc-A', managerId: 'A', nickname: '小美', createdAt: CA }] }, mgr('A')).escorts), ['esc-A']);
  assert.deepEqual(ids(run({ escorts: [{ id: 'esc-B', managerId: 'B', nickname: '小美', createdAt: CA }] }, mgr('B')).escorts), ['esc-B']);
  assert.deepEqual(run({ escorts: [{ id: 'e', managerId: 'B', nickname: 'x', createdAt: CA }] }, mgr('A')).escorts, []);
  assert.deepEqual(run({ escorts: [{ id: 'e', managerId: 'A', nickname: 'x', createdAt: CA }] }, usr('A')).escorts, []);
});
test('escorts update：本人可改名稱、簡介與區域；凍結身份欄位、takeover 丟棄', () => {
  const cols = { escorts: [{ id: 'esc-A', managerId: 'A', nickname: '小美', bio: '', defaultArea: '信義區', createdAt: CA }] };
  const m = one(run({ escorts: [{ id: 'esc-A', managerId: 'HACK', createdAt: 'HACK', nickname: '安安', bio: '喜歡聊天', defaultArea: '大安區', removed: true }] }, mgr('A'), cols).escorts);
  assert.equal(m.managerId, 'A'); assert.equal(m.createdAt, CA); assert.equal(m.nickname, '安安'); assert.equal(m.bio, '喜歡聊天'); assert.equal(m.defaultArea, '大安區'); assert.equal(m.removed, true);
  const invalid = one(run({ escorts: [{ id: 'esc-A', nickname: 'x'.repeat(21), bio: 'x'.repeat(101), defaultArea: '' }] }, mgr('A'), cols).escorts);
  assert.equal(invalid.nickname, '小美'); assert.equal(invalid.bio, ''); assert.equal(invalid.defaultArea, '信義區');
  assert.deepEqual(run({ escorts: [{ id: 'esc-A', managerId: 'B', nickname: 'x' }] }, mgr('B'), cols).escorts, []);
  assert.deepEqual(run({ escorts: [{ id: 'esc-A', managerId: 'A', nickname: 'x' }] }, mgr('B'), cols).escorts, []);
});
test('escorts delete：removed tombstone 不可被舊裝置復活或改寫', () => {
  const deleted = { id: 'esc-A', managerId: 'A', nickname: '已刪除人員', bio: '', defaultArea: '信義區', createdAt: CA, removed: true };
  const cols = { escorts: [deleted] };
  const explicitlyRevived = one(run({ escorts: [{ id: 'esc-A', nickname: '舊名稱', removed: false }] }, mgr('A'), cols).escorts);
  const omittedRemoved = one(run({ escorts: [{ id: 'esc-A', nickname: '舊名稱' }] }, mgr('A'), cols).escorts);
  assert.deepEqual(explicitlyRevived, deleted);
  assert.deepEqual(omittedRemoved, deleted);
});

// ══ presence / photos（M1 / B）══
test('presence/photos：本人 escort 可寫；他人/未知/removed/非 manager 丟棄；同批新 escort 可帶 presence', () => {
  const cols = { escorts: [
    { id: 'girlA', managerId: 'A', nickname: 'a', createdAt: CA },
    { id: 'girlB', managerId: 'B', nickname: 'b', createdAt: CA },
    { id: 'girlAr', managerId: 'A', nickname: 'r', createdAt: CA, removed: true },
  ] };
  const out = run({
    presence: [{ id: 'girlA', online: true }, { id: 'girlB', online: true }, { id: 'girlAr', online: true }, { id: 'u-x', online: true }],
    photoOverrides: [{ id: 'girlA', avatarUrl: 'x' }, { id: 'girlB', avatarUrl: 'y' }],
  }, mgr('A'), cols);
  assert.deepEqual(ids(out.presence), ['girlA']);
  assert.deepEqual(ids(out.photoOverrides), ['girlA']);
  assert.deepEqual(run({ presence: [{ id: 'girlA', online: true }] }, usr('A'), cols).presence, []);
  const batch = run({ escorts: [{ id: 'ne', managerId: 'A', nickname: 'n', createdAt: CA }], presence: [{ id: 'ne', online: true }] }, mgr('A'));
  assert.deepEqual(ids(batch.presence), ['ne']);
});

// ══ requests（M5）══
test('requests：creator-only、發局者可編輯白名單欄位、凍結身份/時間、takeover 丟棄', () => {
  const created = one(run({ requests: [{ id: 'r1', creatorId: 'A', area: '信義區', requestType: 'other', venueType: 'bar', createdAt: CA, attendanceSummary: { joiningCount: 999, confirmedCount: 999 } }] }, usr('A')).requests);
  assert.equal(created.createdAt, ACCEPTED_AT);
  assert.equal(created.expiresAt, new Date(NOW + 2 * 60 * 60 * 1000).toISOString());
  assert.equal(created.status, 'open');
  assert.equal(created.attendanceSummary, undefined, '匿名統計只能由讀取端產生，不得由 client 寫入');
  assert.deepEqual(run({ requests: [{ id: 'r1', creatorId: 'B', area: '信義區', requestType: 'other', venueType: 'bar', createdAt: CA }] }, usr('A')).requests, []);
  const cols = { requests: [{ id: 'r1', creatorId: 'A', createdAt: CA, expiresAt: CA, area: '信義區', venueType: 'bar', partyFormat: 'with_women', requestType: 'other', peopleCount: 2, note: '原文', status: 'open' }] };
  const m = one(run({ requests: [{ id: 'r1', creatorId: 'HACK', createdAt: 'HACK', expiresAt: 'HACK', area: '大安區', venueType: 'nightclub', partyFormat: 'one_on_one', requestType: 'dancing', peopleCount: 4, note: '更新', status: 'closed' }] }, usr('A'), cols).requests);
  assert.equal(m.status, 'closed'); assert.equal(m.creatorId, 'A'); assert.equal(m.createdAt, CA); assert.equal(m.expiresAt, CA);
  assert.equal(m.area, '大安區'); assert.equal(m.venueType, 'nightclub'); assert.equal(m.partyFormat, 'one_on_one'); assert.equal(m.requestType, 'dancing'); assert.equal(m.peopleCount, 4); assert.equal(m.note, '更新');
  const invalid = one(run({ requests: [{ id: 'r1', area: '', venueType: 'hack', partyFormat: 'hack', requestType: 'hack', peopleCount: 99, note: 'x'.repeat(201) }] }, usr('A'), cols).requests);
  assert.equal(invalid.area, '信義區'); assert.equal(invalid.venueType, 'bar'); assert.equal(invalid.partyFormat, 'with_women'); assert.equal(invalid.requestType, 'other'); assert.equal(invalid.peopleCount, 2); assert.equal(invalid.note, '原文');
  const closedCols = { requests: [{ ...cols.requests[0], status: 'closed' }] };
  const closed = one(run({ requests: [{ id: 'r1', area: '大安區', note: '不可更新' }] }, usr('A'), closedCols).requests);
  assert.equal(closed.area, '信義區'); assert.equal(closed.note, '原文');
  assert.deepEqual(run({ requests: [{ id: 'r1', creatorId: 'B', status: 'closed' }] }, usr('B'), cols).requests, []);
});

// ══ responses create（M2 / C）══
test('responses create：本人加入(request 存在、無 dispatcher)；派工(自己 escort)', () => {
  const cols = { requests: [{ id: 'r1', creatorId: 'C', createdAt: CA }], escorts: [{ id: 'girlA', managerId: 'A', nickname: 'a', createdAt: CA }] };
  assert.deepEqual(ids(run({ responses: [{ id: 'x1', requestId: 'r1', userId: 'U', responseStatus: 'interested', createdAt: CA }] }, usr('U'), cols).responses), ['x1']);
  assert.deepEqual(run({ responses: [{ id: 'x2', requestId: 'rX', userId: 'U', createdAt: CA }] }, usr('U'), cols).responses, []);
  assert.deepEqual(run({ responses: [{ id: 'x3', requestId: 'r1', userId: 'U', dispatcherId: 'A', createdAt: CA }] }, usr('U'), cols).responses, []);
  assert.deepEqual(ids(run({ responses: [{ id: 'd1', requestId: 'r1', userId: 'girlA', dispatcherId: 'A', createdAt: CA }] }, mgr('A'), cols).responses), ['d1']);
  assert.deepEqual(run({ responses: [{ id: 'd2', requestId: 'r1', userId: 'girlB', dispatcherId: 'A', createdAt: CA }] }, mgr('A'), cols).responses, []);
});
test('responses create：initial 狀態由 server 強制 interested，不接受 incoming joining', () => {
  const cols = { requests: [{ id: 'r1', creatorId: 'C', createdAt: CA }], escorts: [{ id: 'girlA', managerId: 'A', nickname: 'a', createdAt: CA }] };
  // 客戶首次加入直送 joining → server 重建為 interested（跳過接受被擋）
  assert.equal(one(run({ responses: [{ id: 'x1', requestId: 'r1', userId: 'U', responseStatus: 'joining', createdAt: CA }] }, usr('U'), cols).responses).responseStatus, 'interested');
  // manager 派工直送 joining → interested
  assert.equal(one(run({ responses: [{ id: 'd1', requestId: 'r1', userId: 'girlA', dispatcherId: 'A', responseStatus: 'joining', createdAt: CA }] }, mgr('A'), cols).responses).responseStatus, 'interested');
  // 正常 interested create 保持
  assert.equal(one(run({ responses: [{ id: 'x2', requestId: 'r1', userId: 'U', responseStatus: 'interested', createdAt: CA }] }, usr('U'), cols).responses).responseStatus, 'interested');
});

// ══ responses update transition matrix（Blocker 4）══
test('responses transition：self 加入/撤回/重加合法、self 自升 joining 拒絕', () => {
  const cols = { requests: [{ id: 'r1', creatorId: 'C', createdAt: CA }], responses: [
    { id: 's1', requestId: 'r1', userId: 'U', responseStatus: 'interested', createdAt: CA },
    { id: 's2', requestId: 'r1', userId: 'U', responseStatus: 'withdrawn', createdAt: CA },
  ] };
  assert.equal(one(run({ responses: [{ id: 's1', responseStatus: 'withdrawn' }] }, usr('U'), cols).responses).responseStatus, 'withdrawn'); // 撤回
  assert.equal(one(run({ responses: [{ id: 's2', responseStatus: 'interested', createdAt: '2099-01-01T00:00:00.000Z' }] }, usr('U'), cols).responses).createdAt, '2099-01-01T00:00:00.000Z'); // 重加刷新
  assert.equal(one(run({ responses: [{ id: 's1', responseStatus: 'joining' }] }, usr('U'), cols).responses).responseStatus, 'interested'); // 自升 joining → 凍結
});
test('responses transition：creator 接受/婉拒合法、creator 改回 interested/withdrawn 拒絕', () => {
  const cols = { requests: [{ id: 'r1', creatorId: 'C', createdAt: CA }], responses: [
    { id: 'a1', requestId: 'r1', userId: 'U', responseStatus: 'interested', createdAt: CA },
    { id: 'a2', requestId: 'r1', userId: 'U', responseStatus: 'joining', createdAt: CA },
  ] };
  assert.equal(one(run({ responses: [{ id: 'a1', responseStatus: 'joining' }] }, usr('C'), cols).responses).responseStatus, 'joining'); // 接受
  assert.equal(one(run({ responses: [{ id: 'a2', responseStatus: 'declined' }] }, usr('C'), cols).responses).responseStatus, 'declined'); // 婉拒已入局
  assert.equal(one(run({ responses: [{ id: 'a2', responseStatus: 'interested' }] }, usr('C'), cols).responses).responseStatus, 'joining'); // creator 亂改 → 凍結
});
test('responses transition：dispatcher 重派(withdrawn→interested) 合法且不能自設 joining；無關 manager 丟棄', () => {
  const cols = { requests: [{ id: 'r1', creatorId: 'C', createdAt: CA }], escorts: [{ id: 'girlA', managerId: 'A', nickname: 'a', createdAt: CA }], responses: [
    { id: 'd1', requestId: 'r1', userId: 'girlA', dispatcherId: 'A', responseStatus: 'withdrawn', createdAt: CA },
    { id: 'd2', requestId: 'r1', userId: 'girlA', dispatcherId: 'A', responseStatus: 'interested', createdAt: CA },
  ] };
  assert.equal(one(run({ responses: [{ id: 'd1', responseStatus: 'interested', createdAt: '2099-01-01T00:00:00.000Z' }] }, mgr('A'), cols).responses).responseStatus, 'interested'); // 重派
  assert.equal(one(run({ responses: [{ id: 'd2', responseStatus: 'joining' }] }, mgr('A'), cols).responses).responseStatus, 'interested'); // 派工者不能接受(joining) → 凍結
  assert.deepEqual(run({ responses: [{ id: 'd2', responseStatus: 'declined' }] }, mgr('Z'), cols).responses, []); // 無關 manager 丟棄
});
test('responses 重新派工：不得接管別的 manager 既有 dispatcher', () => {
  const cols = { requests: [{ id: 'r1', creatorId: 'C', createdAt: CA }], escorts: [{ id: 'g', managerId: 'A', nickname: 'a', createdAt: CA }],
    responses: [{ id: 's1', requestId: 'r1', userId: 'g', dispatcherId: 'B', responseStatus: 'withdrawn', createdAt: CA }] };
  assert.deepEqual(run({ responses: [{ id: 's1', responseStatus: 'interested', dispatcherId: 'A' }] }, mgr('A'), cols).responses, []);
});

// ══ invitations create matrix（Blocker 1）══
test('invitations create：sendInvite 強制 pending、剝除偽造欄位、一般邀請需 request 存在', () => {
  const cols = { requests: [{ id: 'r1', creatorId: 'C', createdAt: CA }] };
  // status=accepted → 強制 pending；剝除 dispatcherId/chatExpiresAt/meetupConfirmed/respondedAt
  const b = one(run({ invitations: [{ id: 'i1', fromUserId: 'S', toUserId: 'T', requestId: 'r1', status: 'accepted', dispatcherId: 'X', chatExpiresAt: CA, meetupConfirmed: true, respondedAt: CA, createdAt: CA }] }, usr('S'), cols).invitations);
  assert.equal(b.status, 'pending'); assert.equal(b.dispatcherId, undefined); assert.equal(b.chatExpiresAt, undefined);
  assert.equal(b.meetupConfirmed, undefined); assert.equal(b.respondedAt, undefined);
  // 一般邀請 requestId 不存在 → 丟棄
  assert.deepEqual(run({ invitations: [{ id: 'i2', fromUserId: 'S', toUserId: 'T', requestId: 'rX', createdAt: CA }] }, usr('S'), cols).invitations, []);
  // 私人邀請（requestId=null）→ pending 建立
  assert.equal(one(run({ invitations: [{ id: 'i3', fromUserId: 'S', toUserId: 'T', requestId: null, createdAt: CA }] }, usr('S')).invitations).status, 'pending');
});
test('invitations create：acceptResponder 嚴格交叉驗證（effective response 須 joining）', () => {
  const cols = {
    requests: [{ id: 'r1', creatorId: 'C', createdAt: CA }],
    responses: [
      { id: 'rp1', requestId: 'r1', userId: 'girlA', dispatcherId: 'A', responseStatus: 'joining', createdAt: CA }, // 派工·已接受
      { id: 'rp2', requestId: 'r1', userId: 'U2', responseStatus: 'joining', createdAt: CA },                        // 自加入·已接受
      { id: 'rp3', requestId: 'r1', userId: 'U3', responseStatus: 'withdrawn', createdAt: CA },                      // 已撤回
      { id: 'rp4', requestId: 'r1', userId: 'U4', responseStatus: 'interested', createdAt: CA },                     // 尚未接受
    ],
  };
  assert.deepEqual(ids(run({ invitations: [{ id: 'iv1', fromUserId: 'A', toUserId: 'C', requestId: 'r1', dispatcherId: 'A', status: 'accepted', createdAt: CA }] }, usr('C'), cols).invitations), ['iv1']); // 派工 joining
  assert.deepEqual(ids(run({ invitations: [{ id: 'iv2', fromUserId: 'U2', toUserId: 'C', requestId: 'r1', status: 'accepted', createdAt: CA }] }, usr('C'), cols).invitations), ['iv2']); // 自加入 joining
  assert.deepEqual(run({ invitations: [{ id: 'iv3', fromUserId: 'A', toUserId: 'C', requestId: 'r1', dispatcherId: 'WRONG', status: 'accepted', createdAt: CA }] }, usr('C'), cols).invitations, []); // dispatcherId 不符
  assert.deepEqual(run({ invitations: [{ id: 'iv4', fromUserId: 'girlA', toUserId: 'C', requestId: 'r1', status: 'accepted', createdAt: CA }] }, usr('C'), cols).invitations, []); // fromUserId 偽造無 dispatcher
  assert.deepEqual(run({ invitations: [{ id: 'iv5', fromUserId: 'U3', toUserId: 'C', requestId: 'r1', status: 'accepted', createdAt: CA }] }, usr('C'), cols).invitations, []); // withdrawn response
  assert.deepEqual(run({ invitations: [{ id: 'iv6', fromUserId: 'U4', toUserId: 'C', requestId: 'r1', status: 'accepted', createdAt: CA }] }, usr('C'), cols).invitations, []); // interested(未接受) → 不得建 accepted
  assert.deepEqual(run({ invitations: [{ id: 'iv7', fromUserId: 'U2', toUserId: 'Z', requestId: 'r1', status: 'accepted', createdAt: CA }] }, usr('Z'), cols).invitations, []); // 非該局 creator
});
test('invitations create：同批 response interested→joining ＋ 建 accepted invitation 仍成功（effectiveResponses）', () => {
  const cols = { requests: [{ id: 'r1', creatorId: 'C', createdAt: CA }], responses: [{ id: 'd1', requestId: 'r1', userId: 'g', dispatcherId: 'A', responseStatus: 'interested', createdAt: CA }] };
  const out = run({
    responses: [{ id: 'd1', responseStatus: 'joining' }], // creator 同批接受
    invitations: [{ id: 'iv', fromUserId: 'A', toUserId: 'C', requestId: 'r1', dispatcherId: 'A', status: 'accepted', createdAt: CA }],
  }, usr('C'), cols);
  assert.equal(one(out.responses).responseStatus, 'joining');
  assert.deepEqual(ids(out.invitations), ['iv']); // effective response 已 joining → 邀請建立
});

// ══ invitations update（transition + 凍結）══
test('invitations update：toUserId 前向 accept、私人 from auto-accept、confirmMeetup 單向、凍結身份', () => {
  const cols = { invitations: [
    { id: 'g', fromUserId: 'S', toUserId: 'T', requestId: 'r1', status: 'pending', createdAt: CA },
    { id: 'p', fromUserId: 'S', toUserId: 'T', requestId: null, status: 'pending', createdAt: CA },
    { id: 'a', fromUserId: 'S', toUserId: 'T', requestId: 'r1', status: 'accepted', createdAt: CA },
  ] };
  const t = one(run({ invitations: [{ id: 'g', fromUserId: 'HACK', status: 'accepted', respondedAt: CA, chatExpiresAt: CA }] }, usr('T'), cols).invitations);
  assert.equal(t.status, 'accepted'); assert.equal(t.fromUserId, 'S');
  assert.equal(t.respondedAt, ACCEPTED_AT); assert.equal(t.chatExpiresAt, CHAT_EXPIRES_AT);
  assert.equal(one(run({ invitations: [{ id: 'g', status: 'accepted' }] }, usr('S'), cols).invitations).status, 'pending'); // 一般邀請 sender 不可自我接受
  const privateAccepted = one(run({ invitations: [{ id: 'p', status: 'accepted', chatExpiresAt: CA }] }, usr('S'), cols).invitations);
  assert.equal(privateAccepted.status, 'accepted'); // 私人 auto-accept
  assert.equal(privateAccepted.respondedAt, ACCEPTED_AT);
  assert.equal(privateAccepted.chatExpiresAt, CHAT_EXPIRES_AT);
  assert.equal(one(run({ invitations: [{ id: 'a', meetupConfirmed: true }] }, usr('T'), cols).invitations).meetupConfirmed, true);
  assert.equal(one(run({ invitations: [{ id: 'a', status: 'pending' }] }, usr('T'), cols).invitations).status, 'accepted'); // 反向 accepted→pending 拒絕
});

// ══ updates（Blocker 3：依 eventType 驗 actor + recipient）══
test('updates request_posted：actor 須為該局 creator、收件人須可信 manager', () => {
  const cols = { requests: [{ id: 'r1', creatorId: 'A', createdAt: CA }] };
  const managers = ['u-018', 'u-023'];
  assert.deepEqual(ids(run({ updates: [{ id: 'n1', actorId: 'A', userId: 'u-018', eventType: 'request_posted', refRequestId: 'r1' }] }, usr('A'), cols, managers).updates), ['n1']);
  assert.deepEqual(run({ updates: [{ id: 'n2', actorId: 'A', userId: 'victim', eventType: 'request_posted', refRequestId: 'r1' }] }, usr('A'), cols, managers).updates, []); // 非 manager 收件人
  assert.deepEqual(run({ updates: [{ id: 'n3', actorId: 'A', userId: 'u-018', eventType: 'request_posted', refRequestId: 'rX' }] }, usr('A'), cols, managers).updates, []); // 局不存在
  // B 用「別人的 request(r1, creator=A)」冒充 request_posted（actor=B≠creator）→ 丟棄
  assert.deepEqual(run({ updates: [{ id: 'n4', actorId: 'B', userId: 'u-018', eventType: 'request_posted', refRequestId: 'r1' }] }, usr('B'), cols, managers).updates, []);
});
test('updates response_received：收件人必為 creator；self 須有 effective response 或 delegation', () => {
  const cols = { requests: [{ id: 'r1', creatorId: 'C', createdAt: CA }], escorts: [{ id: 'girlA', managerId: 'A', nickname: 'a', createdAt: CA }],
    responses: [
      { id: 'rp', requestId: 'r1', userId: 'girlA', dispatcherId: 'A', responseStatus: 'interested', createdAt: CA },
      { id: 'rpU', requestId: 'r1', userId: 'U', responseStatus: 'interested', createdAt: CA },
    ] };
  assert.deepEqual(ids(run({ updates: [{ id: 's', actorId: 'U', userId: 'C', eventType: 'response_received', refRequestId: 'r1' }] }, usr('U'), cols).updates), ['s']); // 本人加入（有 effective response）
  assert.deepEqual(ids(run({ updates: [{ id: 'd', actorId: 'girlA', userId: 'C', eventType: 'response_received', refRequestId: 'r1' }] }, mgr('A'), cols).updates), ['d']); // delegation
  assert.deepEqual(run({ updates: [{ id: 'b1', actorId: 'girlA', userId: 'C', eventType: 'response_received', refRequestId: 'rX' }] }, mgr('A'), cols).updates, []); // 無對應 response/局
  assert.deepEqual(run({ updates: [{ id: 'b2', actorId: 'U', userId: 'victim', eventType: 'response_received', refRequestId: 'r1' }] }, usr('U'), cols).updates, []); // 收件人非 creator
  // 本人但「沒有 effective response」→ 丟棄（refReq 無此 actor 的 response）
  const cols2 = { requests: [{ id: 'r1', creatorId: 'C', createdAt: CA }] };
  assert.deepEqual(run({ updates: [{ id: 'noresp', actorId: 'U', userId: 'C', eventType: 'response_received', refRequestId: 'r1' }] }, usr('U'), cols2).updates, []);
});
test('updates invite_received/accepted：必須精確符合邀請雙方；亂發丟棄；existing append-only；非法 eventType 丟棄', () => {
  const cols = { invitations: [
    { id: 'inv1', fromUserId: 'S', toUserId: 'T', requestId: 'r1', status: 'pending', createdAt: CA },
    { id: 'inv2', fromUserId: 'P', toUserId: 'C', requestId: 'r1', status: 'accepted', createdAt: CA }, // acceptResponder：from=partner P、to=creator C
    { id: 'inv3', fromUserId: 'S', toUserId: 'IV', requestId: null, status: 'accepted', createdAt: CA }, // 私人：from=sender S、to=invitee IV
    { id: 'inv4', fromUserId: 'Q', toUserId: 'R', requestId: 'r1', status: 'pending', createdAt: CA }, // 尚未接受
  ], updates: [{ id: 'ex', userId: 'x', actorId: 'y', eventType: 'invite_received' }] };
  assert.deepEqual(ids(run({ updates: [{ id: 'ir', actorId: 'S', userId: 'T', eventType: 'invite_received', refRequestId: 'r1' }] }, usr('S'), cols).updates), ['ir']); // 寄件者→收件者
  assert.deepEqual(run({ updates: [{ id: 'ir2', actorId: 'S', userId: 'stranger', eventType: 'invite_received' }] }, usr('S'), cols).updates, []); // 無對應邀請
  assert.deepEqual(ids(run({ updates: [{ id: 'ia', actorId: 'C', userId: 'P', eventType: 'invite_accepted', refRequestId: 'r1' }] }, usr('C'), cols).updates), ['ia']); // acceptResponder：actor=creator C、rcpt=partner P（inv2: from=P,to=C）
  assert.deepEqual(ids(run({ updates: [{ id: 'ip', actorId: 'IV', userId: 'S', eventType: 'invite_accepted' }] }, usr('S'), cols).updates), ['ip']); // 私人 auto-accept：actor=invitee IV、rcpt=sender S（inv3: from=S,to=IV）
  assert.deepEqual(run({ updates: [{ id: 'ipend', actorId: 'R', userId: 'Q', eventType: 'invite_accepted' }] }, usr('Q'), cols).updates, []); // inv4 尚 pending → invite_accepted 不得發
  assert.deepEqual(run({ updates: [{ id: 'iax', actorId: 'stranger', userId: 'S', eventType: 'invite_accepted' }] }, usr('S'), cols).updates, []); // userId=me 但無對應邀請 → 丟棄
  assert.deepEqual(run({ updates: [{ id: 'ex', actorId: 'S', userId: 'T', eventType: 'invite_received' }] }, usr('S'), cols).updates, []); // 既有 append-only
  assert.deepEqual(run({ updates: [{ id: 'ev', actorId: 'S', userId: 'S', eventType: 'evil' }] }, usr('S'), cols).updates, []); // 非法 eventType
});
test('updates：actor===me 但收件人無關 victim → 丟棄（不再無條件放行）', () => {
  const cols = { requests: [{ id: 'r1', creatorId: 'A', createdAt: CA }] };
  assert.deepEqual(run({ updates: [{ id: 'x', actorId: 'A', userId: 'victim', eventType: 'response_received', refRequestId: 'r1' }] }, usr('A'), cols).updates, []); // response_received 收件人須 creator(A)≠victim
});

// ══ M6（Blocker 2：existing 以 server 重建、凍結身份）══
test('M6：既有 owner=me 只重建允許欄位、凍結身份；他人 existing id 丟棄；本人合法新建保留', () => {
  const cols = {
    blocks: [{ id: 'A__x', blockerId: 'A', blockedId: 'x', active: true, createdAt: CA }, { id: 'victim__y', blockerId: 'victim', blockedId: 'y', active: true, createdAt: CA }],
    momentPosts: [{ id: 'pA', authorId: 'A', content: 'orig', likeCount: 0 }, { id: 'pV', authorId: 'victim', content: 'v' }],
    plazaComments: [{ id: 'cA', userId: 'A', postId: 'p', text: 'orig' }, { id: 'cV', userId: 'victim', postId: 'p', text: 'v' }],
  };
  // 自己的 block：改 blockerId/blockedId 被凍結，只 active 生效
  const bl = one(run({ blocks: [{ id: 'A__x', blockerId: 'HACK', blockedId: 'HACK', active: false }] }, usr('A'), cols).blocks);
  assert.equal(bl.blockerId, 'A'); assert.equal(bl.blockedId, 'x'); assert.equal(bl.active, false);
  // 自己的 post：改 authorId/content 被凍結，只 likeCount 生效
  const mp = one(run({ momentPosts: [{ id: 'pA', authorId: 'B', content: 'HACK', likeCount: 5 }] }, usr('A'), cols).momentPosts);
  assert.equal(mp.authorId, 'A'); assert.equal(mp.content, 'orig'); assert.equal(mp.likeCount, 5);
  // 自己的 comment：無編輯流程 → 沿用 server（text/userId/postId 不變）
  const pc = one(run({ plazaComments: [{ id: 'cA', userId: 'HACK', postId: 'HACK', text: 'edited' }] }, usr('A'), cols).plazaComments);
  assert.equal(pc.userId, 'A'); assert.equal(pc.postId, 'p'); assert.equal(pc.text, 'orig');
  // 他人 existing id（owner=self 覆寫）一律丟棄
  assert.deepEqual(run({ blocks: [{ id: 'victim__y', blockerId: 'A', blockedId: 'y', active: false }] }, usr('A'), cols).blocks, []);
  assert.deepEqual(run({ momentPosts: [{ id: 'pV', authorId: 'A', content: 'hack' }] }, usr('A'), cols).momentPosts, []);
  assert.deepEqual(run({ plazaComments: [{ id: 'cV', userId: 'A', text: 'hack' }] }, usr('A'), cols).plazaComments, []);
  // 本人合法新建
  assert.deepEqual(ids(run({ momentPosts: [{ id: 'pNew', authorId: 'A', content: 'mine' }] }, usr('A')).momentPosts), ['pNew']);
  assert.deepEqual(run({ registeredUsers: [{ id: 'other' }, { id: 'A' }] }, usr('A')).registeredUsers.map((u) => u.id), ['A']);
});

// ══ chatMessages（規格十 / D：senderId===me + 聊天室成員）══
test('chatMessages：senderId===me 且必須是聊天室合法成員（1:1 由 invitation 兩端）', () => {
  const cols = { invitations: [{ id: 'iv', fromUserId: 'A', toUserId: 'x', requestId: null, status: 'accepted', chatExpiresAt: '2999-01-01T00:00:00.000Z', createdAt: CA }] };
  // A 為 A-x 成員：senderId===A 通過；senderId===B（非本人）丟棄
  assert.deepEqual(ids(run({ chatMessages: [
    { id: 'm1', threadId: 'A-x', senderId: 'A', text: 'hi', createdAt: CA },
    { id: 'm2', threadId: 'A-x', senderId: 'B', text: 'x', createdAt: CA },
  ] }, usr('A'), cols).chatMessages), ['m1']);
  // 無任何關係（threadId 非成員）→ 即使 senderId===me 也丟棄（D 收緊：不再只看 senderId）
  assert.deepEqual(run({ chatMessages: [{ id: 'm3', threadId: 'A-x', senderId: 'A', text: 'hi', createdAt: CA }] }, usr('A')).chatMessages, []);
});

// ══ full snapshot（F）══
test('full snapshot：數千筆外來項丟棄，本人合法項保留、不整批失敗', () => {
  const foreign = Array.from({ length: 3000 }, (_, i) => ({ id: `fr${i}`, creatorId: `other-${i}`, createdAt: CA }));
  assert.deepEqual(ids(run({ requests: [...foreign, { id: 'mine', creatorId: 'A', area: '信義區', requestType: 'other', venueType: 'bar', createdAt: CA }] }, usr('A')).requests), ['mine']);
});

// ══ 多幹部、同一真實小姐完全獨立（G：H2 回歸）══
test('多幹部同一真實小姐：各自 escort 獨立、B 無法接管 A、H2 ownership 維持 A、不因同名去重', () => {
  const cols = { escorts: [{ id: 'esc-A', managerId: 'A', nickname: '小美', createdAt: CA }, { id: 'esc-B', managerId: 'B', nickname: '安安', createdAt: CA }] };
  assert.deepEqual(ids(run({ presence: [{ id: 'esc-A', online: true }, { id: 'esc-B', online: false }] }, mgr('A'), cols).presence), ['esc-A']);
  assert.deepEqual(ids(run({ presence: [{ id: 'esc-A', online: true }, { id: 'esc-B', online: false }] }, mgr('B'), cols).presence), ['esc-B']);
  assert.deepEqual(run({ photoOverrides: [{ id: 'esc-A', avatarUrl: 'a' }] }, mgr('B'), cols).photoOverrides, []);
  assert.deepEqual(run({ escorts: [{ id: 'esc-A', managerId: 'B', nickname: 'takeover', removed: true }] }, mgr('B'), cols).escorts, []); // H2 ownership 維持 A
  assert.deepEqual(ids(run({ escorts: [{ id: 'esc-A2', managerId: 'A', nickname: '同名', createdAt: CA }] }, mgr('A')).escorts), ['esc-A2']);
  assert.deepEqual(ids(run({ escorts: [{ id: 'esc-B2', managerId: 'B', nickname: '同名', createdAt: CA }] }, mgr('B')).escorts), ['esc-B2']);
});
