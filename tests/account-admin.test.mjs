import test from 'node:test';
import assert from 'node:assert/strict';

const authStore = await import('@/lib/auth-store');
const sessionStore = await import('@/lib/session');
const accountAdminRoute = await import('@/app/api/account-admin/route');

const REDIS = Boolean(
  process.env.KV_REST_API_URL
  || process.env.KV_URL
  || process.env.UPSTASH_REDIS_REST_URL
  || process.env.REDIS_URL
);
const skip = REDIS ? 'requires isolated in-memory account storage' : false;

test('A021-A025 use requested defaults and require a first-login rename', { skip }, async () => {
  for (let number = 21; number <= 25; number += 1) {
    const key = `A${String(number).padStart(3, '0')}`;
    const account = await authStore.getAccount(key);
    assert.equal(account?.role, 'manager');
    assert.equal(account?.nickname, `幹部${number}`);
    assert.equal(account?.mustChangeNickname, true);
    assert.equal(account?.hash, null);
  }
});

test('A888 is isolated from A000 and activates with its own one-time code', { skip }, async () => {
  const before = await authStore.getAccount('A888');
  assert.equal(before?.role, 'account_admin');
  assert.equal(before?.hash, null);

  const activationCode = await authStore.regenerateAccountAdminActivation('A888');
  assert.ok(activationCode);
  const activated = await authStore.activateAccountAdminWithCode('A888', activationCode, 'Strong!Pass8');
  assert.equal(activated?.role, 'account_admin');
  assert.ok(activated?.hash);

  const reused = await authStore.activateAccountAdminWithCode('A888', activationCode, 'Other!Pass9');
  assert.equal(reused, null);
});

test('A777 is a read-only observer limited to A001-A010', { skip }, async () => {
  const viewer = await authStore.getAccount('A777');
  assert.equal(viewer?.role, 'account_admin');
  assert.equal(viewer?.nickname, '幹部狀態查看員');

  const token = await sessionStore.signSession({
    userId: viewer.userId,
    role: 'account_admin',
    tier: viewer.tier,
    sessionVersion: viewer.sessionVersion,
  });
  const headers = { cookie: `${sessionStore.SESSION_COOKIE}=${encodeURIComponent(token)}` };
  const getResponse = await accountAdminRoute.GET(new Request('http://localhost/api/account-admin', { headers }));
  const getBody = getResponse.body;
  assert.equal(getResponse.status, 200);
  assert.equal(getBody.readOnly, true);
  assert.deepEqual(getBody.managers.map((manager) => manager.key), [
    'A001', 'A002', 'A003', 'A004', 'A005', 'A006', 'A007', 'A008', 'A009', 'A010',
  ]);

  const postResponse = await accountAdminRoute.POST(new Request('http://localhost/api/account-admin', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'disable', account: 'A001' }),
  }));
  assert.equal(postResponse.status, 403);
});

test('reserved manager clears the rename requirement only after choosing a non-default name', { skip }, async () => {
  const adminEdited = await authStore.updateManagerNickname('A024', '管理員代改名稱');
  assert.equal(adminEdited?.mustChangeNickname, true);

  const account = await authStore.getAccount('A025');
  assert.ok(account);
  const updated = await authStore.updateOwnManagerNickname(account.userId, '王小明');
  assert.equal(updated?.nickname, '王小明');
  assert.equal(updated?.mustChangeNickname, false);
});
