import test from 'node:test';
import assert from 'node:assert/strict';

const authStore = await import('@/lib/auth-store');
const sessionStore = await import('@/lib/session');
const activeSession = await import('@/lib/active-session');
const syncStore = await import('@/lib/sync-store');
const accountAdminRoute = await import('@/app/api/account-admin/route');
const authRoute = await import('@/app/api/auth/route');

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

test('A777 can inspect every manager and keep a private manager name without gaining account controls', { skip }, async () => {
  const viewer = await authStore.getAccount('A777');
  assert.equal(viewer?.role, 'account_viewer');
  assert.equal(viewer?.nickname, '幹部稽查員');
  assert.equal(viewer?.hash, null);

  const manager = await authStore.getAccount('A001');
  assert.ok(manager);
  const now = new Date().toISOString();
  await syncStore.mergeShared({
    escorts: [{
      id: 'a777-roster-test-member',
      managerId: manager.userId,
      nickname: '稽查測試小姐',
      avatarUrl: 'https://example.invalid/private-photo.jpg',
      bio: '不應回傳的自介',
      createdAt: now,
    }],
    presence: [{ id: 'a777-roster-test-member', online: true, updatedAt: now }],
  });

  const token = await sessionStore.signSession({
    userId: viewer.userId,
    role: 'account_viewer',
    tier: viewer.tier,
    sessionVersion: viewer.sessionVersion,
  });
  const headers = { cookie: `${sessionStore.SESSION_COOKIE}=${encodeURIComponent(token)}` };
  const getResponse = await accountAdminRoute.GET(new Request('http://localhost/api/account-admin', { headers }));
  const getBody = getResponse.body;
  assert.equal(getResponse.status, 200);
  assert.equal(getBody.readOnly, true);
  assert.equal(getBody.managers.some((item) => item.key === 'A001'), true);
  assert.equal(getBody.managers.some((item) => item.key === 'A025'), true);
  assert.equal(getBody.managers.some((item) => item.key === 'A777' || item.key === 'A888'), false);

  const roster = getBody.rosters.find((item) => item.managerKey === 'A001');
  assert.ok(roster);
  assert.equal(roster.activeCount >= 1, true);
  assert.equal(roster.totalCreated >= 1, true);
  const member = roster.members.find((item) => item.nickname === '稽查測試小姐');
  assert.deepEqual(member, { nickname: '稽查測試小姐', status: 'online' });
  assert.equal('managerId' in roster, false);
  assert.equal('id' in member, false);
  assert.equal('createdAt' in member, false);
  assert.equal(JSON.stringify(getBody).includes('private-photo.jpg'), false);
  assert.equal(JSON.stringify(getBody).includes('不應回傳的自介'), false);

  const privateNameResponse = await accountAdminRoute.POST(new Request('http://localhost/api/account-admin', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'save-private-name', account: 'A001', privateName: '東區阿明' }),
  }));
  assert.equal(privateNameResponse.status, 200);

  const refreshedResponse = await accountAdminRoute.GET(new Request('http://localhost/api/account-admin', { headers }));
  const refreshedManager = refreshedResponse.body.managers.find((item) => item.key === 'A001');
  assert.equal(refreshedManager.privateName, '東區阿明');
  assert.equal(refreshedManager.nickname, manager.nickname);

  const accountAdmin = await authStore.getAccount('A888');
  assert.ok(accountAdmin);
  const accountAdminToken = await sessionStore.signSession({
    userId: accountAdmin.userId,
    role: 'account_admin',
    tier: accountAdmin.tier,
    sessionVersion: accountAdmin.sessionVersion,
  });
  const accountAdminResponse = await accountAdminRoute.GET(new Request('http://localhost/api/account-admin', {
    headers: { cookie: `${sessionStore.SESSION_COOKIE}=${encodeURIComponent(accountAdminToken)}` },
  }));
  const accountAdminManager = accountAdminResponse.body.managers.find((item) => item.key === 'A001');
  assert.equal('privateName' in accountAdminManager, false);

  const postResponse = await accountAdminRoute.POST(new Request('http://localhost/api/account-admin', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'disable', account: 'A001' }),
  }));
  assert.equal(postResponse.status, 403);
});

test('A777 sets its own password once without an activation code', { skip }, async () => {
  const loginResponse = await authRoute.POST(new Request('http://localhost/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'login', account: 'A777', password: 'Strong!Pass8' }),
  }));
  assert.equal(loginResponse.status, 200);
  const loginBody = loginResponse.body;
  assert.equal(loginBody.user.role, 'account_viewer');

  const activated = await authStore.getAccount('A777');
  assert.equal(activated?.role, 'account_viewer');
  assert.ok(activated?.hash);
  const reused = await authStore.setInitialAccountViewerPassword('A777', 'Other!Pass9');
  assert.equal(reused, null);

  const token = await sessionStore.signSession({
    userId: activated.userId,
    role: 'account_viewer',
    tier: activated.tier,
    sessionVersion: activated.sessionVersion,
  });
  const headers = { cookie: `${sessionStore.SESSION_COOKIE}=${encodeURIComponent(token)}` };
  const blocked = await activeSession.requireActiveSession(new Request('http://localhost/api/issues', { headers }));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.response.status, 403);
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
