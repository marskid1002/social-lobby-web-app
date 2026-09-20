import test from 'node:test';
import assert from 'node:assert/strict';

// Never run destructive fixtures against an external database.
if (['KV_REST_API_URL', 'KV_URL', 'UPSTASH_REDIS_REST_URL', 'REDIS_URL'].some((key) => process.env[key])) {
  throw new Error('Chat history tests require isolated in-memory storage');
}
const store = await import('@/lib/sync-store');
const auth = await import('@/lib/auth-store');
const { signSession } = await import('@/lib/session');
const { GET, POST } = await import('@/app/api/admin/route');
const old = new Date(Date.now() - 72 * 3600_000).toISOString();

async function request(path, body, accountKey = 'A000') {
  const account = await auth.getAccount(accountKey);
  const token = await signSession({ userId: account.userId, role: account.role, tier: account.tier, sessionVersion: account.sessionVersion });
  return new Request(`http://localhost/api/admin${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { cookie: `sl_session=${encodeURIComponent(token)}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test('expiry hides frontend records but preserves complete text, photo, invitation and request evidence', async () => {
  await store.mergeShared({
    requests: [{ id: 'retention-r', status: 'closed', createdAt: old, expiresAt: old }],
    responses: [{ id: 'retention-response', requestId: 'retention-r', userId: 'girl' }],
    invitations: [{ id: 'retention-inv', requestId: 'retention-r', chatThreadId: 'retention-chat', fromUserId: 'manager', toUserId: 'customer', status: 'accepted', createdAt: old, chatExpiresAt: old }],
    chatMessages: Array.from({ length: 501 }, (_, index) => ({ id: `retention-msg-${index}`, threadId: 'retention-chat', requestId: 'retention-r', senderId: 'manager', text: `secret-${index}`, imageUrl: 'https://images.juga.com.tw/photo.jpg', createdAt: old })),
  });
  const state = await store.getShared();
  assert.equal(state.chatMessages.some((m) => m.threadId === 'retention-chat'), false);
  assert.equal(state.invitations.some((m) => m.id === 'retention-inv'), false);
  assert.equal((await store.getHistoryCollection('chatMessages')).length, 501);
  assert.ok((await store.getHistoryCollection('requests')).some((r) => r.id === 'retention-r'));
  await store.getShared(); // repeated retention must not duplicate/erase archived data
  const detail = await GET(await request('?threadId=retention-chat&requestId=retention-r'));
  assert.equal(detail.status, 200);
  assert.equal(detail.body.messages.length, 501);
  assert.equal(detail.body.messages[0].imageUrl, 'https://images.juga.com.tw/photo.jpg');
  const dashboard = await GET(await request(''));
  assert.ok(dashboard.body.dashboard.conversations.some((c) => c.threadId === 'retention-chat' && c.messageCount === 501));
  assert.equal(JSON.stringify(dashboard.body).includes('secret-'), false);
});

test('A777 cannot read or delete history; incorrect confirmation cannot delete', async () => {
  assert.equal((await GET(new Request('http://localhost/api/admin?threadId=retention-chat'))).status, 401);
  assert.equal((await GET(await request('?threadId=retention-chat', undefined, 'A777'))).status, 403);
  const body = { action: 'delete-chat-history', threadId: 'retention-chat', requestId: 'retention-r', confirmation: 'DELETE retention-chat' };
  assert.equal((await POST(await request('', body, 'A777'))).status, 403);
  assert.equal((await POST(await request('', { ...body, confirmation: 'wrong' }))).status, 400);
  assert.equal((await store.getHistoryCollection('chatMessages')).length, 501);
});

test('confirmed deletion is exact and audit logged, leaving another request in the same legacy thread untouched', async () => {
  await store.mergeShared({ chatMessages: [{ id: 'other-msg', threadId: 'retention-chat', requestId: 'other-r', text: 'other', createdAt: old }] });
  await store.getShared();
  const result = await POST(await request('', { action: 'delete-chat-history', threadId: 'retention-chat', requestId: 'retention-r', confirmation: 'DELETE retention-chat' }));
  assert.equal(result.status, 200);
  assert.equal(result.body.count, 502);
  assert.deepEqual((await store.getHistoryCollection('chatMessages')).map((m) => m.id), ['other-msg']);
  const { listAdminAudit } = await import('@/lib/admin-audit-store');
  assert.ok((await listAdminAudit()).some((r) => r.action === 'delete-chat-history' && r.target === 'retention-chat'));
});

test('live chat cannot be deleted; clear and account deletion preserve historical messages', async () => {
  const now = new Date().toISOString();
  await store.mergeShared({ chatMessages: [{ id: 'live-msg', threadId: 'live-chat', senderId: 'delete-customer', text: 'preserve', createdAt: now }] });
  await assert.rejects(store.deleteArchivedConversation('live-chat', ''), /CHAT_NOT_ARCHIVED/);
  await store.deleteUserData('delete-customer');
  assert.ok((await store.getHistoryCollection('chatMessages')).some((m) => m.id === 'live-msg'));
  await store.mergeShared({ chatMessages: [{ id: 'clear-msg', threadId: 'clear-chat', text: 'preserve clear', createdAt: now }] });
  await store.clearShared();
  assert.ok((await store.getHistoryCollection('chatMessages')).some((m) => m.id === 'clear-msg'));
  assert.equal((await store.getCollection('chatMessages')).length, 0);
});

test('manager deleting a gallery photo cannot remove a file referenced by archived chat', async () => {
  const { POST: upload } = await import('@/app/api/upload/route');
  const manager = await auth.getAccount('A003');
  const url = `https://abc.public.blob.vercel-storage.com/uploads/${manager.userId}/image/11111111-2222-4333-8444-555555555555.jpg`;
  await store.mergeShared({ chatMessages: [{ id: 'protected-photo', threadId: 'photo-chat', imageUrl: url, createdAt: old }] });
  await store.getShared();
  const previous = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = 'test-only';
  globalThis.__BLOB_DEL_CALLS__ = [];
  try {
    const response = await upload(await request('', { action: 'delete', url }, 'A003'));
    assert.equal(response.status, 200);
    assert.equal(response.body.retainedForChatHistory, true);
    assert.deepEqual(globalThis.__BLOB_DEL_CALLS__, []);
  } finally {
    if (previous === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previous;
  }
});
