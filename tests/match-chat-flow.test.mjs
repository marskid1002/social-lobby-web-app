// 接受入局與訊息落盤整合測試。直接呼叫 production route；本機有 Redis env 時跳過，避免碰正式資料。
//
// 執行：node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/match-chat-flow.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const { POST: acceptMatch } = await import('@/app/api/matches/accept/route');
const { POST: sendMessage } = await import('@/app/api/chat/messages/route');
const { signSession } = await import('@/lib/session');
const store = await import('@/lib/sync-store');
const authStore = await import('@/lib/auth-store');
const { canonicalThreadId } = await import('@/lib/chat-authz');

const REDIS = Boolean(
  process.env.KV_REST_API_URL
  || process.env.KV_URL
  || process.env.UPSTASH_REDIS_REST_URL
  || process.env.REDIS_URL
);
const skip = REDIS ? '偵測到 Redis 環境變數：跳過整合測試以免碰 production' : false;
const CA = '2026-07-30T00:00:00.000Z';
let phoneSeq = 970000000;

async function customer(nickname) {
  phoneSeq += 1;
  return authStore.createCustomer(`0${phoneSeq}`, 'Pw!23456', nickname);
}

async function requestFor(route, session, body) {
  const token = await signSession(session);
  return route(new Request('http://localhost/api/test', {
    method: 'POST',
    headers: {
      cookie: `sl_session=${encodeURIComponent(token)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  }));
}

test('接受入局由 server 建立 response/invitation/update；重複請求冪等', { skip }, async () => {
  await store.clearShared();
  const creator = await customer('creator-accept');
  const manager = await authStore.getAccount('A001');
  assert.ok(manager);
  await store.mergeShared({
    requests: [{ id: 'req-accept', creatorId: creator.userId, status: 'open', createdAt: CA }],
    responses: [{
      id: 'resp-accept',
      requestId: 'req-accept',
      userId: 'esc-accept',
      dispatcherId: manager.userId,
      responseStatus: 'interested',
      createdAt: CA,
    }],
  });

  const session = { userId: creator.userId, role: 'user', tier: 'standard' };
  const first = await requestFor(acceptMatch, session, { responseId: 'resp-accept' });
  assert.equal(first.status, 200);
  const firstBody = first.body;
  assert.equal(firstBody.ok, true);
  assert.equal(firstBody.response.responseStatus, 'joining');
  assert.equal(firstBody.invitation.fromUserId, manager.userId);
  assert.equal(firstBody.invitation.toUserId, creator.userId);
  assert.equal(firstBody.invitation.status, 'accepted');
  assert.ok(Date.parse(firstBody.invitation.chatExpiresAt) > Date.now());

  assert.equal((await store.getCollection('responses')).find((item) => item.id === 'resp-accept')?.responseStatus, 'joining');
  assert.equal((await store.getCollection('invitations')).length, 1);
  assert.equal((await store.getCollection('updates')).length, 1);

  const second = await requestFor(acceptMatch, session, { responseId: 'resp-accept' });
  assert.equal(second.status, 200);
  const secondBody = second.body;
  assert.equal(secondBody.alreadyAccepted, true);
  assert.equal(secondBody.invitation.id, firstBody.invitation.id);
  assert.equal((await store.getCollection('invitations')).length, 1);
  assert.equal((await store.getCollection('updates')).length, 1);
});

test('非局主不能接受；失敗時不建立聊天室', { skip }, async () => {
  await store.clearShared();
  const creator = await customer('creator-owner');
  const attacker = await customer('not-owner');
  const manager = await authStore.getAccount('A001');
  assert.ok(manager);
  await store.mergeShared({
    requests: [{ id: 'req-owner', creatorId: creator.userId, status: 'open', createdAt: CA }],
    responses: [{
      id: 'resp-owner',
      requestId: 'req-owner',
      userId: 'esc-owner',
      dispatcherId: manager.userId,
      responseStatus: 'interested',
      createdAt: CA,
    }],
  });

  const res = await requestFor(
    acceptMatch,
    { userId: attacker.userId, role: 'user', tier: 'standard' },
    { responseId: 'resp-owner' },
  );
  assert.equal(res.status, 403);
  assert.equal((await store.getCollection('invitations')).length, 0);
  assert.equal((await store.getCollection('updates')).length, 0);
  assert.equal((await store.getCollection('responses'))[0].responseStatus, 'interested');
});

test('聊天室建立前訊息被拒；建立後客戶與幹部皆可寫入且 sender 以 session 為準', { skip }, async () => {
  await store.clearShared();
  const creator = await customer('creator-chat');
  const stranger = await customer('stranger-chat');
  const manager = await authStore.getAccount('A001');
  assert.ok(manager);
  const threadId = canonicalThreadId(creator.userId, manager.userId);
  const creatorSession = { userId: creator.userId, role: 'user', tier: 'standard' };
  const managerSession = { userId: manager.userId, role: 'manager', tier: 'vip' };

  const before = await requestFor(sendMessage, creatorSession, {
    threadId,
    text: 'before',
    requestId: 'req-chat',
    senderId: manager.userId,
  });
  assert.equal(before.status, 409);
  assert.equal((await store.getCollection('chatMessages')).length, 0);

  await store.mergeShared({
    requests: [{ id: 'req-chat', creatorId: creator.userId, status: 'open', createdAt: CA }],
    responses: [{
      id: 'resp-chat',
      requestId: 'req-chat',
      userId: 'esc-chat',
      dispatcherId: manager.userId,
      responseStatus: 'interested',
      createdAt: CA,
    }],
  });
  const accepted = await requestFor(acceptMatch, creatorSession, { responseId: 'resp-chat' });
  assert.equal(accepted.status, 200);

  const customerMessage = await requestFor(sendMessage, creatorSession, {
    threadId,
    text: 'hello',
    requestId: 'req-chat',
    senderId: manager.userId,
  });
  assert.equal(customerMessage.status, 200);
  const customerBody = customerMessage.body;
  assert.equal(customerBody.message.senderId, creator.userId);

  const managerMessage = await requestFor(sendMessage, managerSession, {
    threadId,
    text: 'hi',
    requestId: 'req-chat',
  });
  assert.equal(managerMessage.status, 200);

  const strangerMessage = await requestFor(
    sendMessage,
    { userId: stranger.userId, role: 'user', tier: 'standard' },
    { threadId, text: 'intrude', requestId: 'req-chat' },
  );
  assert.equal(strangerMessage.status, 409);
  const messages = await store.getCollection('chatMessages');
  assert.deepEqual(messages.map((message) => message.text).sort(), ['hello', 'hi']);
});

test('已確認見面或期限無效時，server 拒絕新訊息且不留假訊息', { skip }, async () => {
  const manager = await authStore.getAccount('A001');
  assert.ok(manager);
  for (const invitationPatch of [
    { meetupConfirmed: true, chatExpiresAt: '2999-01-01T00:00:00.000Z' },
    { meetupConfirmed: false, chatExpiresAt: 'not-a-date' },
  ]) {
    await store.clearShared();
    const creator = await customer(`closed-${String(invitationPatch.chatExpiresAt)}`);
    const threadId = canonicalThreadId(creator.userId, manager.userId);
    await store.mergeShared({
      invitations: [{
        id: `inv-${creator.userId}`,
        fromUserId: manager.userId,
        toUserId: creator.userId,
        requestId: 'req-closed',
        status: 'accepted',
        createdAt: CA,
        ...invitationPatch,
      }],
    });
    const res = await requestFor(
      sendMessage,
      { userId: creator.userId, role: 'user', tier: 'standard' },
      { threadId, text: 'should-not-store', requestId: 'req-closed' },
    );
    assert.equal(res.status, 409);
    assert.equal((await store.getCollection('chatMessages')).length, 0);
  }
});
