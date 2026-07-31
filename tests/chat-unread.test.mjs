import test from 'node:test';
import assert from 'node:assert/strict';

const { unreadMessagesFor, totalUnreadMessages } = await import('@/lib/chat-unread');

const messages = [
  { id: 'm1', threadId: 't1', requestId: 'r1', senderId: 'customer', text: 'old', createdAt: '2026-08-01T00:00:00.000Z' },
  { id: 'm2', threadId: 't1', requestId: 'r1', senderId: 'manager', text: 'mine', createdAt: '2026-08-01T00:01:00.000Z' },
  { id: 'm3', threadId: 't1', requestId: 'r1', senderId: 'customer', text: 'new', createdAt: '2026-08-01T00:02:00.000Z' },
  { id: 'm4', threadId: 't1', requestId: 'r2', senderId: 'customer', text: 'other request', createdAt: '2026-08-01T00:03:00.000Z' },
];

test('未讀訊息依使用者、聊天室及局別隔離，自己發送的不計入', () => {
  const reads = [{
    id: 'read-1',
    userId: 'manager',
    threadId: 't1',
    requestId: 'r1',
    lastReadMessageId: 'm2',
    lastReadAt: '2026-08-01T00:01:00.000Z',
  }];

  assert.deepEqual(
    unreadMessagesFor(messages, reads, 'manager', 't1', 'r1').map((message) => message.id),
    ['m3'],
  );
  assert.equal(totalUnreadMessages(messages, reads, 'manager'), 2);
});

test('不同帳號的已讀紀錄不會互相覆蓋', () => {
  const reads = [{
    id: 'read-customer',
    userId: 'customer',
    threadId: 't1',
    requestId: 'r1',
    lastReadAt: '2026-08-01T00:10:00.000Z',
  }];

  assert.equal(unreadMessagesFor(messages, reads, 'manager', 't1', 'r1').length, 2);
});
