// G：推播收件人規劃純函式測試。
// 執行：node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/push-authz.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const { planAuthorizedSyncPushes } = await import('@/lib/push-authz');

const session = (userId, role = 'user') => ({
  userId,
  role,
  tier: role === 'manager' ? 'vip' : 'standard',
});

test('新局：收件人由 server 幹部名單決定，忽略 client update 收件人', () => {
  const jobs = planAuthorizedSyncPushes({
    patch: {
      requests: [{ id: 'r1', creatorId: 'customer', status: 'open' }],
      updates: [{ id: 'fake', userId: 'victim', actorId: 'customer' }],
    },
    existing: { requests: [] },
    managerUserIds: ['manager-a', 'manager-b', 'manager-a', 'customer'],
    session: session('customer'),
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].kind, 'request');
  assert.deepEqual(jobs[0].userIds, ['manager-a', 'manager-b']);
});

test('加入／派工：收件人固定為 server request creator', () => {
  const existing = {
    requests: [{ id: 'r1', creatorId: 'creator', status: 'open' }],
    responses: [],
  };
  const selfJoin = planAuthorizedSyncPushes({
    patch: {
      responses: [{
        id: 'resp-self',
        requestId: 'r1',
        userId: 'escort',
        responseStatus: 'interested',
      }],
    },
    existing,
    managerUserIds: [],
    session: session('escort'),
  });
  assert.deepEqual(selfJoin.map((job) => job.userIds), [['creator']]);

  const dispatch = planAuthorizedSyncPushes({
    patch: {
      responses: [{
        id: 'resp-dispatch',
        requestId: 'r1',
        userId: 'girl',
        dispatcherId: 'manager',
        responseStatus: 'interested',
      }],
    },
    existing,
    managerUserIds: [],
    session: session('manager', 'manager'),
  });
  assert.deepEqual(dispatch.map((job) => job.userIds), [['creator']]);
});

test('邀請：收件人固定為已授權 invitation.toUserId', () => {
  const jobs = planAuthorizedSyncPushes({
    patch: {
      invitations: [{
        id: 'invite-1',
        fromUserId: 'sender',
        toUserId: 'recipient',
        requestId: null,
        status: 'pending',
      }],
    },
    existing: { invitations: [] },
    managerUserIds: [],
    session: session('sender'),
  });
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].userIds, ['recipient']);
  assert.equal(jobs[0].url, '/inbox');
});

test('既有項目不重複推播；withdrawn 重新變 interested 才再通知', () => {
  const existing = {
    requests: [{ id: 'r1', creatorId: 'creator', status: 'open' }],
    responses: [
      { id: 'same', requestId: 'r1', userId: 'escort', responseStatus: 'interested' },
      { id: 'retry', requestId: 'r1', userId: 'escort', responseStatus: 'withdrawn' },
    ],
    invitations: [{
      id: 'invite-old',
      fromUserId: 'escort',
      toUserId: 'creator',
      status: 'pending',
    }],
  };
  const jobs = planAuthorizedSyncPushes({
    patch: {
      responses: [
        { ...existing.responses[0] },
        { ...existing.responses[1], responseStatus: 'interested' },
      ],
      invitations: [{ ...existing.invitations[0] }],
    },
    existing,
    managerUserIds: [],
    session: session('escort'),
  });
  assert.deepEqual(jobs.map((job) => job.entityId), ['retry']);
});

test('防禦性檢查：caller 不擁有的 request/response/invitation 不產生推播', () => {
  const jobs = planAuthorizedSyncPushes({
    patch: {
      requests: [{ id: 'r1', creatorId: 'other', status: 'open' }],
      responses: [{
        id: 'resp',
        requestId: 'stored',
        userId: 'other',
        responseStatus: 'interested',
      }],
      invitations: [{
        id: 'invite',
        fromUserId: 'other',
        toUserId: 'victim',
        status: 'pending',
      }],
    },
    existing: {
      requests: [{ id: 'stored', creatorId: 'victim', status: 'open' }],
      responses: [],
      invitations: [],
    },
    managerUserIds: ['manager'],
    session: session('attacker'),
  });
  assert.deepEqual(jobs, []);
});
