import test from 'node:test';
import assert from 'node:assert/strict';

const {
  newRequestAttentionKeys,
  pendingAttendanceAttentionKeys,
  unreadChatAttentionKeys,
} = await import('@/lib/attention-badge');

const NOW = Date.parse('2026-08-15T12:00:00.000Z');
const FUTURE = '2026-08-15T14:00:00.000Z';
const PAST = '2026-08-15T10:00:00.000Z';

test('a new active request stays pending until this manager dispatches a girl', () => {
  const requests = [
    { id: 'r-1', creatorId: 'customer-1', status: 'open', expiresAt: FUTURE },
    { id: 'r-2', creatorId: 'customer-2', status: 'open', expiresAt: FUTURE },
    { id: 'r-expired', creatorId: 'customer-3', status: 'open', expiresAt: PAST },
    { id: 'r-closed', creatorId: 'customer-4', status: 'closed', expiresAt: FUTURE },
  ];
  const otherManagerResponse = { id: 'resp-other', requestId: 'r-1', dispatcherId: 'manager-2' };
  assert.deepEqual(
    newRequestAttentionKeys(requests, [otherManagerResponse], 'manager-1', NOW),
    ['request:r-1', 'request:r-2'],
  );

  const myDispatch = { id: 'resp-mine', requestId: 'r-1', dispatcherId: 'manager-1' };
  assert.deepEqual(
    newRequestAttentionKeys(requests, [otherManagerResponse, myDispatch], 'manager-1', NOW),
    ['request:r-2'],
  );
});

test('ten unread messages in one conversation count as one attention item', () => {
  const messages = [
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `m-${index}`,
      threadId: 'chat-a',
      senderId: 'customer-1',
      text: String(index),
      createdAt: `2026-08-15T11:${String(index).padStart(2, '0')}:00.000Z`,
    })),
    { id: 'm-other', threadId: 'chat-b', senderId: 'customer-2', text: 'hi', createdAt: '2026-08-15T11:30:00.000Z' },
    { id: 'm-mine', threadId: 'chat-c', senderId: 'manager-1', text: 'mine', createdAt: '2026-08-15T11:40:00.000Z' },
  ];
  assert.deepEqual(
    unreadChatAttentionKeys(messages, [], 'manager-1').sort(),
    ['chat:chat-a:', 'chat:chat-b:'],
  );

  const reads = [{ id: 'read-a', userId: 'manager-1', threadId: 'chat-a', lastReadAt: '2026-08-15T11:59:00.000Z' }];
  assert.deepEqual(unreadChatAttentionKeys(messages, reads, 'manager-1'), ['chat:chat-b:']);
});

test('each dispatched girl awaiting manager attendance confirmation counts once', () => {
  const base = {
    requestId: 'r-1',
    fromUserId: 'manager-1',
    toUserId: 'customer-1',
    status: 'accepted',
    dispatcherId: 'manager-1',
    chatExpiresAt: FUTURE,
  };
  const invitations = [
    { ...base, id: 'attendance-1' },
    { ...base, id: 'attendance-2' },
    { ...base, id: 'confirmed', managerDecision: 'confirmed' },
    { ...base, id: 'not-accepted', status: 'pending' },
    { ...base, id: 'expired', chatExpiresAt: PAST },
    { ...base, id: 'other-manager', dispatcherId: 'manager-2', fromUserId: 'manager-2' },
  ];
  assert.deepEqual(
    pendingAttendanceAttentionKeys(invitations, 'manager-1', NOW),
    ['attendance:attendance-1', 'attendance:attendance-2'],
  );
});
