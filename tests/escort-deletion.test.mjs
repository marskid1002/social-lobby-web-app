import test from 'node:test';
import assert from 'node:assert/strict';

const authStore = await import('@/lib/auth-store');
const { signSession } = await import('@/lib/session');
const store = await import('@/lib/sync-store');
const { DELETE } = await import('@/app/api/escorts/[id]/route');

const REDIS = Boolean(
  process.env.KV_REST_API_URL
  || process.env.KV_URL
  || process.env.UPSTASH_REDIS_REST_URL
  || process.env.REDIS_URL
);
const skip = REDIS ? '偵測到 Redis 環境變數：跳過 route 測試以免碰 production' : false;

async function managerRequest(account, escortId) {
  const token = await signSession({
    userId: account.userId,
    role: 'manager',
    tier: account.tier,
    sessionVersion: account.sessionVersion,
  });
  return DELETE(new Request(`http://localhost/api/escorts/${escortId}`, {
    method: 'DELETE',
    headers: { cookie: `sl_session=${encodeURIComponent(token)}` },
  }), { params: Promise.resolve({ id: escortId }) });
}

test('幹部只能永久刪除自己的小姐，並清掉相片與上線資料', { skip }, async () => {
  const owner = (await authStore.createManagerAccount('永久刪除測試 A')).account;
  const other = (await authStore.createManagerAccount('永久刪除測試 B')).account;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ownId = `esc-delete-own-${suffix}`;
  const otherId = `esc-delete-other-${suffix}`;
  const busyId = `esc-delete-busy-${suffix}`;
  const responseId = `response-delete-${suffix}`;

  await store.mergeShared({
    escorts: [
      { id: ownId, managerId: owner.userId, nickname: '自己的小姐', createdAt: new Date().toISOString() },
      { id: otherId, managerId: other.userId, nickname: '別人的小姐', createdAt: new Date().toISOString() },
      { id: busyId, managerId: owner.userId, nickname: '安排中的小姐', createdAt: new Date().toISOString() },
    ],
    presence: [{ id: ownId, online: true }],
    photoOverrides: [{ id: ownId, avatarUrl: 'https://example.com/avatar.jpg' }],
    photoGalleries: [{ id: ownId, urls: ['https://example.com/gallery.jpg'] }],
    responses: [{ id: responseId, requestId: `request-${suffix}`, userId: busyId }],
    invitations: [{
      id: `invitation-${suffix}`,
      requestId: `request-${suffix}`,
      responseId,
      status: 'accepted',
      managerDecision: 'confirmed',
      chatExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    }],
  });

  assert.equal((await managerRequest(owner, otherId)).status, 403);
  assert.equal((await managerRequest(owner, busyId)).status, 409);
  assert.equal((await managerRequest(owner, ownId)).status, 200);

  for (const key of ['escorts', 'presence', 'photoOverrides', 'photoGalleries']) {
    assert.equal((await store.getCollection(key)).some((item) => item.id === ownId), false);
  }
  assert.equal((await store.getCollection('escorts')).some((item) => item.id === otherId), true);
  assert.equal((await store.getCollection('escorts')).some((item) => item.id === busyId), true);
});
