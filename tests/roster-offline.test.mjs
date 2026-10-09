import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '@/app/api/escorts/offline/route';
import { getAccount, setAccountDisabled } from '@/lib/auth-store';
import { signSession } from '@/lib/session';
import { getCollection, mergeShared } from '@/lib/sync-store';

const bodyOf = async r => typeof r.json === 'function' ? r.json() : r.body;
async function request(key, body = { confirm: 'all-owned' }) {
  const account = key ? await getAccount(key) : null;
  const cookie = account ? 'sl_session=' + await signSession({ userId: account.userId, role: account.role, tier: account.tier, sessionVersion: account.sessionVersion ?? 0 }) : '';
  return new Request('http://localhost/api/escorts/offline', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
}

test('requires an active manager and explicit confirmation', async () => {
  assert.equal((await POST(await request(null))).status, 401);
  for (const key of ['A000','A777','A888']) assert.equal((await POST(await request(key))).status, 403);
  assert.equal((await POST(await request('A001', {}))).status, 400);
  await setAccountDisabled('A001', true);
  assert.equal((await POST(await request('A001'))).status, 403);
  await setAccountDisabled('A001', false);
});

test('clocks out every active owned online escort, preserves other managers, removed staff and bookings', async () => {
  const manager = await getAccount('A001');
  const other = await getAccount('A002');
  const old = '2026-01-01T00:00:00.000Z';
  await mergeShared({
    escorts: [
      { id: 'off-visible', managerId: manager.userId },
      { id: 'off-search-hidden', managerId: manager.userId },
      { id: 'off-already', managerId: manager.userId },
      { id: 'off-removed', managerId: manager.userId, removed: true },
      { id: 'off-foreign', managerId: other.userId },
    ],
    presence: [
      ...['off-visible','off-search-hidden','off-removed','off-foreign',manager.userId].map(id => ({ id, online: true, updatedAt: old })),
      { id: 'off-already', online: false, updatedAt: old },
    ],
    responses: [{ id: 'off-booking', girlId: 'off-visible', status: 'confirmed' }],
    invitations: [{ id: 'off-invite', girlId: 'off-search-hidden', status: 'accepted' }],
    chatMessages: [{ id: 'off-chat', text: 'preserve conversation' }],
  });
  const before = await Promise.all(['responses','invitations','chatMessages'].map(getCollection));
  // Client-supplied ownership/ids must not widen or narrow the server-owned roster.
  const response = await POST(await request('A001', { confirm: 'all-owned', managerId: other.userId, ids: ['off-visible','off-foreign'] }));
  assert.equal(response.status, 200);
  assert.equal((await bodyOf(response)).count, 2);
  const presence = new Map((await getCollection('presence')).map(p => [p.id,p]));
  for (const id of ['off-visible','off-search-hidden']) { assert.equal(presence.get(id).online, false); assert.notEqual(presence.get(id).updatedAt, old); }
  for (const id of ['off-removed','off-foreign',manager.userId]) assert.equal(presence.get(id).online, true);
  assert.equal(presence.get('off-already').updatedAt, old);
  assert.deepEqual(await Promise.all(['responses','invitations','chatMessages'].map(getCollection)), before);
  assert.equal((await bodyOf(await POST(await request('A001')))).count, 0);
});

test('empty rosters succeed without changing another manager presence', async () => {
  const before = await getCollection('presence');
  const result = await POST(await request('A003'));
  assert.equal((await bodyOf(result)).count, 0);
  assert.deepEqual(await getCollection('presence'), before);
});
