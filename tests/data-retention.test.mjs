import test from 'node:test';
import assert from 'node:assert/strict';

const { planDataRetention, REQUEST_ACTIVE_MS, REQUEST_RETENTION_MS } = await import('@/lib/data-retention');
const { CHAT_LIFETIME_MS } = await import('@/lib/chat-lifetime');

const NOW = Date.parse('2026-08-03T12:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();
const empty = (patch = {}) => ({
  requests: [], responses: [], invitations: [], updates: [], chatMessages: [], chatReads: [],
  presence: [], photoOverrides: [], photoGalleries: [], registeredUsers: [], blocks: [], escorts: [],
  momentPosts: [], plazaComments: [], ...patch,
});

test('局只公開 2 小時，但資料到第 8 小時才清除', () => {
  assert.equal(REQUEST_ACTIVE_MS, 2 * 60 * 60 * 1000);
  const request = { id: 'r1', creatorId: 'u1', createdAt: iso(NOW - REQUEST_RETENTION_MS), expiresAt: iso(NOW - 6 * 60 * 60 * 1000) };
  const plan = planDataRetention(empty({ requests: [request] }), NOW);
  assert.deepEqual(plan.state.requests, []);
  assert.deepEqual(plan.remove.requests, ['r1']);
});

test('局滿 8 小時但聊天室仍有效時，保留局與聊天室所需關聯資料', () => {
  const openedAt = NOW - 10 * 60 * 60 * 1000;
  const plan = planDataRetention(empty({
    requests: [{ id: 'r1', createdAt: iso(openedAt - 60 * 60 * 1000) }],
    responses: [{ id: 'rp1', requestId: 'r1', userId: 'u2' }],
    invitations: [{ id: 'i1', requestId: 'r1', fromUserId: 'u2', toUserId: 'u1', status: 'accepted', respondedAt: iso(openedAt), chatExpiresAt: iso(openedAt + CHAT_LIFETIME_MS), createdAt: iso(openedAt) }],
    chatMessages: [{ id: 'm1', threadId: 'u1-u2', requestId: 'r1', createdAt: iso(openedAt) }],
    chatReads: [{ id: 'rd1', threadId: 'u1-u2', requestId: 'r1', lastReadAt: iso(openedAt) }],
  }), NOW);
  assert.deepEqual(plan.state.requests.map((item) => item.id), ['r1']);
  assert.deepEqual(plan.state.invitations.map((item) => item.id), ['i1']);
  assert.deepEqual(plan.state.responses.map((item) => item.id), ['rp1']);
  assert.deepEqual(plan.state.chatMessages.map((item) => item.id), ['m1']);
  assert.deepEqual(plan.state.chatReads.map((item) => item.id), ['rd1']);
});

test('聊天室建立滿 48 小時後，同步清除邀請、訊息、已讀與關聯回應', () => {
  const openedAt = NOW - CHAT_LIFETIME_MS;
  const plan = planDataRetention(empty({
    responses: [{ id: 'rp1', requestId: 'r1', userId: 'u2' }],
    invitations: [{ id: 'i1', requestId: 'r1', fromUserId: 'u2', toUserId: 'u1', status: 'accepted', respondedAt: iso(openedAt), chatExpiresAt: iso(NOW), createdAt: iso(openedAt) }],
    chatMessages: [{ id: 'm1', threadId: 'u1-u2', requestId: 'r1', createdAt: iso(NOW - 1000) }],
    chatReads: [{ id: 'rd1', threadId: 'u1-u2', requestId: 'r1', lastReadAt: iso(NOW - 1000) }],
  }), NOW);
  assert.deepEqual(plan.state.invitations, []);
  assert.deepEqual(plan.state.responses, []);
  assert.deepEqual(plan.state.chatMessages, []);
  assert.deepEqual(plan.state.chatReads, []);
});

test('未成立的邀請與局資料一樣在 8 小時後清除', () => {
  const createdAt = iso(NOW - REQUEST_RETENTION_MS);
  const plan = planDataRetention(empty({
    invitations: [{ id: 'pending', requestId: null, fromUserId: 'u1', toUserId: 'u2', status: 'pending', createdAt }],
  }), NOW);
  assert.deepEqual(plan.state.invitations, []);
  assert.deepEqual(plan.remove.invitations, ['pending']);
});
