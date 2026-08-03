// 接受入局與訊息落盤整合測試。直接呼叫 production route；本機有 Redis env 時跳過，避免碰正式資料。
//
// 執行：node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/match-chat-flow.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const { POST: acceptMatch } = await import('@/app/api/matches/accept/route');
const { POST: sendMessage } = await import('@/app/api/chat/messages/route');
const { POST: decideChat } = await import('@/app/api/chat/decision/route');
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
// 這些測試會經過真實 store（mergeShared → getShared → planDataRetention，以實際 Date.now() 判斷）。
// 固定的舊日期會被 8 小時保留規則清除，導致 request/response 在接受入局前就消失。
// 因此建立時間一律相對於「執行當下」產生（聊天室到期時間由 production 的 chatExpiresAtFrom 產生，不在此覆寫）。
const CA = new Date(Date.now() - 5 * 60_000).toISOString(); // 5 分鐘前：仍在 8 小時保留期內
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
  assert.equal(firstBody.invitation.responseId, 'resp-accept');
  assert.match(firstBody.invitation.chatThreadId, /^d-[a-f0-9]{16}$/);
  assert.equal(firstBody.invitation.status, 'accepted');
  assert.equal(
    Date.parse(firstBody.invitation.chatExpiresAt) - Date.parse(firstBody.invitation.respondedAt),
    48 * 60 * 60 * 1000,
  );

  assert.equal((await store.getCollection('responses')).find((item) => item.id === 'resp-accept')?.responseStatus, 'joining');
  assert.equal((await store.getCollection('invitations')).length, 1);
  assert.equal((await store.getCollection('updates')).length, 1);

  const second = await requestFor(acceptMatch, session, { responseId: 'resp-accept' });
  assert.equal(second.status, 200);
  const secondBody = second.body;
  assert.equal(secondBody.alreadyAccepted, true);
  assert.equal(secondBody.invitation.id, firstBody.invitation.id);
  assert.equal(secondBody.invitation.chatExpiresAt, firstBody.invitation.chatExpiresAt);
  assert.equal((await store.getCollection('invitations')).length, 1);
  assert.equal((await store.getCollection('updates')).length, 1);
});

test('同一局由同一幹部派兩位小姐：各自建立獨立聊天室與訊息串', { skip }, async () => {
  await store.clearShared();
  const creator = await customer('creator-two-escorts');
  const manager = await authStore.getAccount('A001');
  assert.ok(manager);
  const customerSession = { userId: creator.userId, role: 'user', tier: 'standard' };
  const managerSession = { userId: manager.userId, role: 'manager', tier: 'vip' };
  await store.mergeShared({
    requests: [{ id: 'req-two', creatorId: creator.userId, status: 'open', createdAt: CA }],
    responses: [
      {
        id: 'resp-girl-a',
        requestId: 'req-two',
        userId: 'girl-a',
        dispatcherId: manager.userId,
        responseStatus: 'interested',
        createdAt: CA,
      },
      {
        id: 'resp-girl-b',
        requestId: 'req-two',
        userId: 'girl-b',
        dispatcherId: manager.userId,
        responseStatus: 'interested',
        createdAt: CA,
      },
    ],
  });

  const acceptedA = await requestFor(acceptMatch, customerSession, { responseId: 'resp-girl-a' });
  const acceptedB = await requestFor(acceptMatch, customerSession, { responseId: 'resp-girl-b' });
  assert.equal(acceptedA.status, 200);
  assert.equal(acceptedB.status, 200);
  const threadA = acceptedA.body.invitation.chatThreadId;
  const threadB = acceptedB.body.invitation.chatThreadId;
  assert.notEqual(threadA, threadB);
  assert.equal(acceptedA.body.invitation.responseId, 'resp-girl-a');
  assert.equal(acceptedB.body.invitation.responseId, 'resp-girl-b');
  assert.equal((await store.getCollection('invitations')).length, 2);

  const messageA = await requestFor(sendMessage, customerSession, {
    threadId: threadA,
    requestId: 'req-two',
    text: 'girl-a-only',
  });
  const messageB = await requestFor(sendMessage, managerSession, {
    threadId: threadB,
    requestId: 'req-two',
    text: 'girl-b-only',
  });
  assert.equal(messageA.status, 200);
  assert.equal(messageB.status, 200);
  const messages = await store.getCollection('chatMessages');
  assert.deepEqual(
    messages.map((message) => [message.threadId, message.text]).sort(),
    [[threadA, 'girl-a-only'], [threadB, 'girl-b-only']].sort(),
  );

  const legacyThread = canonicalThreadId(creator.userId, manager.userId);
  const mixed = await requestFor(sendMessage, customerSession, {
    threadId: legacyThread,
    requestId: 'req-two',
    text: 'must-not-merge',
  });
  assert.equal(mixed.status, 409);
});

test('幹部愛心／裂開愛心：限派工幹部操作、逐位小姐隔離；確認後可聊、拒絕後鎖住', { skip }, async () => {
  await store.clearShared();
  const creator = await customer('creator-decisions');
  const manager = await authStore.getAccount('A001');
  const otherManager = await authStore.getAccount('A003');
  assert.ok(manager);
  assert.ok(otherManager);
  const customerSession = { userId: creator.userId, role: 'user', tier: 'standard' };
  const managerSession = { userId: manager.userId, role: 'manager', tier: 'vip' };
  const otherManagerSession = { userId: otherManager.userId, role: 'manager', tier: 'vip' };
  await store.mergeShared({
    requests: [{ id: 'req-decisions', creatorId: creator.userId, status: 'open', createdAt: CA }],
    responses: [
      {
        id: 'resp-confirmed',
        requestId: 'req-decisions',
        userId: 'girl-confirmed',
        dispatcherId: manager.userId,
        responseStatus: 'interested',
        createdAt: CA,
      },
      {
        id: 'resp-declined',
        requestId: 'req-decisions',
        userId: 'girl-declined',
        dispatcherId: manager.userId,
        responseStatus: 'interested',
        createdAt: CA,
      },
    ],
  });

  const acceptedConfirmed = await requestFor(
    acceptMatch,
    customerSession,
    { responseId: 'resp-confirmed' },
  );
  const acceptedDeclined = await requestFor(
    acceptMatch,
    customerSession,
    { responseId: 'resp-declined' },
  );
  const confirmedInvite = acceptedConfirmed.body.invitation;
  const declinedInvite = acceptedDeclined.body.invitation;

  const customerAttempt = await requestFor(decideChat, customerSession, {
    invitationId: confirmedInvite.id,
    decision: 'confirmed',
  });
  assert.equal(customerAttempt.status, 403);
  const otherManagerAttempt = await requestFor(decideChat, otherManagerSession, {
    invitationId: confirmedInvite.id,
    decision: 'confirmed',
  });
  assert.equal(otherManagerAttempt.status, 403);

  const beforeConfirmed = await requestFor(sendMessage, managerSession, {
    threadId: confirmedInvite.chatThreadId,
    requestId: 'req-decisions',
    text: 'before-confirm',
  });
  const beforeDeclined = await requestFor(sendMessage, managerSession, {
    threadId: declinedInvite.chatThreadId,
    requestId: 'req-decisions',
    text: 'before-decline',
  });
  assert.equal(beforeConfirmed.status, 200);
  assert.equal(beforeDeclined.status, 200);

  const confirmed = await requestFor(decideChat, managerSession, {
    invitationId: confirmedInvite.id,
    decision: 'confirmed',
  });
  const declined = await requestFor(decideChat, managerSession, {
    invitationId: declinedInvite.id,
    decision: 'declined',
  });
  assert.equal(confirmed.status, 200);
  assert.equal(declined.status, 200);
  assert.equal(confirmed.body.invitation.managerDecision, 'confirmed');
  assert.equal(confirmed.body.invitation.managerDecisionBy, manager.userId);
  assert.ok(Date.parse(confirmed.body.invitation.managerDecisionAt));
  assert.equal(confirmed.body.invitation.meetupConfirmed, undefined);
  assert.equal(confirmed.body.invitation.chatExpiresAt, confirmedInvite.chatExpiresAt);
  assert.equal(declined.body.invitation.managerDecision, 'declined');
  assert.equal(declined.body.invitation.meetupConfirmed, undefined);

  const storedInvitations = await store.getCollection('invitations');
  assert.equal(
    storedInvitations.find((item) => item.id === confirmedInvite.id)?.managerDecision,
    'confirmed',
  );
  assert.equal(
    storedInvitations.find((item) => item.id === declinedInvite.id)?.managerDecision,
    'declined',
  );
  const storedResponses = await store.getCollection('responses');
  assert.equal(
    storedResponses.find((item) => item.id === 'resp-confirmed')?.responseStatus,
    'joining',
  );
  assert.equal(
    storedResponses.find((item) => item.id === 'resp-declined')?.responseStatus,
    'declined',
  );

  const reverseDecision = await requestFor(decideChat, managerSession, {
    invitationId: confirmedInvite.id,
    decision: 'declined',
  });
  assert.equal(reverseDecision.status, 409);
  const repeatDecision = await requestFor(decideChat, managerSession, {
    invitationId: confirmedInvite.id,
    decision: 'confirmed',
  });
  assert.equal(repeatDecision.status, 200);
  assert.equal(repeatDecision.body.alreadyDecided, true);

  const afterConfirmed = await requestFor(sendMessage, customerSession, {
    threadId: confirmedInvite.chatThreadId,
    requestId: 'req-decisions',
    text: 'after-confirm-still-open',
  });
  assert.equal(afterConfirmed.status, 200);
  const afterDeclined = await requestFor(sendMessage, customerSession, {
    threadId: declinedInvite.chatThreadId,
    requestId: 'req-decisions',
    text: 'must-be-locked',
  });
  assert.equal(afterDeclined.status, 409);
  assert.deepEqual(
    (await store.getCollection('chatMessages')).map((message) => message.text).sort(),
    ['after-confirm-still-open', 'before-confirm', 'before-decline'],
  );
  assert.equal(
    (await store.getCollection('invitations'))
      .find((item) => item.id === confirmedInvite.id)?.chatExpiresAt,
    confirmedInvite.chatExpiresAt,
  );
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
  const legacyThreadId = canonicalThreadId(creator.userId, manager.userId);
  const creatorSession = { userId: creator.userId, role: 'user', tier: 'standard' };
  const managerSession = { userId: manager.userId, role: 'manager', tier: 'vip' };

  const before = await requestFor(sendMessage, creatorSession, {
    threadId: legacyThreadId,
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
  const threadId = accepted.body.invitation.chatThreadId;
  assert.notEqual(threadId, legacyThreadId);

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
