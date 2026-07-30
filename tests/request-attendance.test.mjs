import test from 'node:test';
import assert from 'node:assert/strict';

const {
  activeConfirmedGirlIds,
  confirmedCountForRequest,
  filledRequestClosures,
} = await import('@/lib/request-attendance');
const { planChatDecision } = await import('@/lib/chat-decision');
const { authorizeWrites, buildIndex } = await import('@/lib/sync-authz');

const NOW = Date.parse('2026-07-31T00:00:00.000Z');
const FUTURE = new Date(NOW + 48 * 60 * 60 * 1000).toISOString();
const PAST = new Date(NOW - 1000).toISOString();
const manager = { userId: 'manager-a', role: 'manager', tier: 'vip' };

const response = (id, requestId, userId) => ({
  id,
  requestId,
  userId,
  dispatcherId: manager.userId,
  responseStatus: 'joining',
});

const invitation = (id, requestId, responseId, extra = {}) => ({
  id,
  requestId,
  responseId,
  dispatcherId: manager.userId,
  fromUserId: manager.userId,
  toUserId: 'customer-a',
  status: 'accepted',
  chatThreadId: `thread-${id}`,
  chatExpiresAt: FUTURE,
  ...extra,
});

test('局愛心只計算已確認上台的不同小姐', () => {
  const responses = [
    response('response-a', 'request-a', 'girl-a'),
    response('response-b', 'request-a', 'girl-b'),
  ];
  const invitations = [
    invitation('invite-a', 'request-a', 'response-a', { managerDecision: 'confirmed' }),
    invitation('invite-a-duplicate', 'request-a', 'response-a', { meetupConfirmed: true }),
    invitation('invite-b', 'request-a', 'response-b'),
  ];

  assert.equal(confirmedCountForRequest('request-a', responses, invitations), 1);
});

test('已確認上台的小姐在聊天室有效期間不可再次派工', () => {
  const responses = [
    response('response-active', 'request-a', 'girl-active'),
    response('response-expired', 'request-b', 'girl-expired'),
  ];
  const invitations = [
    invitation('invite-active', 'request-a', 'response-active', { managerDecision: 'confirmed' }),
    invitation('invite-expired', 'request-b', 'response-expired', {
      managerDecision: 'confirmed',
      chatExpiresAt: PAST,
    }),
  ];

  const busy = activeConfirmedGirlIds(responses, invitations, NOW);
  assert.equal(busy.has('girl-active'), true);
  assert.equal(busy.has('girl-expired'), false);
});

test('最後一位確認上台時關閉該局', () => {
  const responses = [
    response('response-a', 'request-a', 'girl-a'),
    response('response-b', 'request-a', 'girl-b'),
  ];
  const invitations = [
    invitation('invite-a', 'request-a', 'response-a', { managerDecision: 'confirmed' }),
    invitation('invite-b', 'request-a', 'response-b'),
  ];

  const result = planChatDecision({
    session: manager,
    invitationId: 'invite-b',
    decision: 'confirmed',
    invitations,
    responses,
    requests: [{
      id: 'request-a',
      creatorId: 'customer-a',
      peopleCount: 2,
      status: 'open',
    }],
    now: NOW,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.invitation.managerDecision, 'confirmed');
  assert.equal(result.request?.status, 'closed');
});

test('同一小姐已在其他局確認上台時拒絕再次確認', () => {
  const responses = [
    response('response-a', 'request-a', 'girl-a'),
    response('response-b', 'request-b', 'girl-a'),
  ];
  const invitations = [
    invitation('invite-a', 'request-a', 'response-a', { managerDecision: 'confirmed' }),
    invitation('invite-b', 'request-b', 'response-b'),
  ];

  const result = planChatDecision({
    session: manager,
    invitationId: 'invite-b',
    decision: 'confirmed',
    invitations,
    responses,
    requests: [{
      id: 'request-b',
      creatorId: 'customer-b',
      peopleCount: 1,
      status: 'open',
    }],
    now: NOW,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 409);
  assert.equal(result.error, 'girl already confirmed elsewhere');
});

test('已上台小姐即使繞過畫面送出派工資料也會被伺服器拒絕', () => {
  const responses = [response('response-a', 'request-a', 'girl-a')];
  const invitations = [
    invitation('invite-a', 'request-a', 'response-a', { managerDecision: 'confirmed' }),
  ];
  const index = buildIndex({
    escorts: [{
      id: 'girl-a',
      managerId: manager.userId,
      nickname: 'Girl A',
      createdAt: new Date(NOW).toISOString(),
    }],
    requests: [
      { id: 'request-a', creatorId: 'customer-a', status: 'closed' },
      { id: 'request-b', creatorId: 'customer-b', status: 'open' },
    ],
    responses,
    invitations,
  });

  const result = authorizeWrites({
    responses: [{
      id: 'response-b',
      requestId: 'request-b',
      userId: 'girl-a',
      dispatcherId: manager.userId,
      responseStatus: 'interested',
    }],
  }, manager, index, NOW);

  assert.deepEqual(result.responses, []);
});

test('新版上線前已滿愛心的舊局會在同步時補關閉', () => {
  const responses = [response('response-a', 'request-a', 'girl-a')];
  const invitations = [
    invitation('invite-a', 'request-a', 'response-a', { managerDecision: 'confirmed' }),
  ];
  const closures = filledRequestClosures([
    {
      id: 'request-a',
      creatorId: 'customer-a',
      peopleCount: 1,
      status: 'open',
    },
  ], responses, invitations);

  assert.equal(closures.length, 1);
  assert.equal(closures[0].status, 'closed');
});
