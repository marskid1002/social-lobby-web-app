import test from 'node:test';
import assert from 'node:assert/strict';

const { activeConfirmedGirlIds } = await import('@/lib/request-attendance');
const { planChatDecision } = await import('@/lib/chat-decision');
const { buildChatAccessIndex, canReadChatThread } = await import('@/lib/chat-authz');

const NOW = Date.parse('2026-08-01T00:00:00.000Z');
const FUTURE = new Date(NOW + 48 * 60 * 60 * 1000).toISOString();
const manager = { userId: 'manager-a', role: 'manager', tier: 'vip' };
const response = {
  id: 'response-a',
  requestId: 'request-a',
  userId: 'girl-a',
  dispatcherId: manager.userId,
  responseStatus: 'joining',
};
const invitation = (extra = {}) => ({
  id: 'invite-a',
  requestId: 'request-a',
  responseId: response.id,
  dispatcherId: manager.userId,
  fromUserId: manager.userId,
  toUserId: 'customer-a',
  status: 'accepted',
  chatThreadId: 'thread-a',
  chatExpiresAt: FUTURE,
  ...extra,
});

test('約會結束後小姐立即解除忙碌，可以再次派工', () => {
  const busy = activeConfirmedGirlIds([response], [invitation({
    managerDecision: 'confirmed',
    meetupEndedAt: new Date(NOW).toISOString(),
  })], NOW);

  assert.equal(busy.has('girl-a'), false);
});

test('只有已成功的約會可以結束，結束時間由伺服器產生', () => {
  const result = planChatDecision({
    session: manager,
    invitationId: 'invite-a',
    decision: 'ended',
    invitations: [invitation({ managerDecision: 'confirmed' })],
    responses: [response],
    requests: [{ id: 'request-a', creatorId: 'customer-a', peopleCount: 1, status: 'closed' }],
    now: NOW,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.invitation.meetupEndedBy, manager.userId);
  assert.equal(result.invitation.meetupEndedAt, new Date(NOW).toISOString());

  const invalid = planChatDecision({
    session: manager,
    invitationId: 'invite-a',
    decision: 'ended',
    invitations: [invitation()],
    responses: [response],
    requests: [{ id: 'request-a', creatorId: 'customer-a', peopleCount: 1, status: 'open' }],
    now: NOW,
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error, 'meetup is not confirmed');
});

test('約會結束後聊天室保留歷史讀取，但禁止再寫入', () => {
  const ended = invitation({
    managerDecision: 'confirmed',
    meetupEndedAt: new Date(NOW).toISOString(),
  });
  const readable = buildChatAccessIndex(manager.userId, {
    invitations: [ended],
    responses: [response],
    requests: [{ id: 'request-a', creatorId: 'customer-a' }],
  });
  const writable = buildChatAccessIndex(manager.userId, {
    invitations: [ended],
    responses: [response],
    requests: [{ id: 'request-a', creatorId: 'customer-a' }],
  }, { writable: true, now: NOW });

  assert.equal(canReadChatThread('thread-a', readable), true);
  assert.equal(canReadChatThread('thread-a', writable), false);
});
