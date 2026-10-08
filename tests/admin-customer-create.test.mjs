import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as provision } from '@/app/api/admin/customers/route';
import { POST as login } from '@/app/api/auth/route';
import { getAccount, verifyPassword, setAccountDisabled, adminResetCustomerPassword, createManagedCustomer } from '@/lib/auth-store';
import { signSession } from '@/lib/session';
import { getCollection } from '@/lib/sync-store';
import { listAdminAudit } from '@/lib/admin-audit-store';

const password = 'Trial!Pass8';
const bodyOf = async (res) => typeof res.json === 'function' ? res.json() : res.body;
async function cookieFor(key) {
  const account = await getAccount(key);
  return 'sl_session=' + await signSession({ userId: account.userId, role: account.role, tier: account.tier, sessionVersion: account.sessionVersion ?? 0 });
}
function request(body, cookie = '') {
  return new Request('http://localhost/api/admin/customers', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
}

test('only active A000 can provision customers', async () => {
  const body = { account: 'ForbiddenGuest', password, nickname: '試用' };
  assert.equal((await provision(request(body))).status, 401);
  for (const key of ['A001', 'A777', 'A888']) {
    assert.equal((await provision(request(body, await cookieFor(key)))).status, 403);
  }
  assert.equal(await getAccount(body.account), null);
  const admin = await getAccount('A000');
  admin.disabled = true;
  assert.equal((await provision(request(body, await cookieFor('A000')))).status, 403);
  admin.disabled = false;
});

test('admin customer can log in, appears in directory/profile, has no elevated role or invented consent', async () => {
  const response = await provision(request({ account: ' hk_trial01 ', password, nickname: ' 香港客戶 ', role: 'admin', tier: 'vip' }, await cookieFor('A000')));
  assert.equal(response.status, 201);
  const result = await bodyOf(response);
  assert.equal(result.account, 'HK_TRIAL01');
  assert.equal(JSON.stringify(result).includes(password), false);
  assert.equal('hash' in result, false);
  const account = await getAccount('hk_trial01');
  assert.equal(account.role, 'user');
  assert.equal(account.tier, 'standard');
  assert.equal(account.nickname, '香港客戶');
  assert.equal(verifyPassword(account, password), true);
  assert.equal(account.termsAcceptedAt, undefined);
  assert.equal(account.ageConfirmedAt, undefined);
  assert.equal((await getCollection('registeredUsers')).find(p => p.id === account.userId)?.nickname, '香港客戶');
  const audit = (await listAdminAudit()).find(a => a.action === 'create-customer');
  assert.equal(audit.target, 'HK_TRIAL01');
  assert.equal(JSON.stringify(audit).includes(password), false);
  const signedIn = await login(request({ action: 'login', account: 'hk_trial01', password }));
  assert.equal(signedIn.status, 200);
  assert.equal((await bodyOf(signedIn)).user.role, 'user');
  const customerCookie = await cookieFor('HK_TRIAL01');
  assert.equal((await provision(request({ account: 'OtherGuest', password, nickname: '其他' }, customerCookie))).status, 403);
  const duplicate = await provision(request({ account: 'HK_TRIAL01', password: 'Other!Pass9', nickname: '覆蓋' }, await cookieFor('A000')));
  assert.equal(duplicate.status, 409);
  assert.equal(verifyPassword(await getAccount('HK_TRIAL01'), password), true);
  await setAccountDisabled('HK_TRIAL01', true);
  assert.equal((await login(request({ action: 'login', account: 'hk_trial01', password }))).status, 403);
  await setAccountDisabled('HK_TRIAL01', false);
  const resetPassword = await adminResetCustomerPassword('HK_TRIAL01');
  assert.equal(typeof resetPassword, 'string');
  assert.equal((await login(request({ action: 'login', account: 'HK_TRIAL01', password: resetPassword }))).status, 200);
});

test('invalid identifiers, weak passwords and missing fields do not create accounts', async () => {
  const cookie = await cookieFor('A000');
  for (const input of [
    { account: 'A000', password, nickname: '測試' },
    { account: 'A99999', password, nickname: '測試' },
    { account: '1234', password, nickname: '測試' },
    { account: 'abc', password, nickname: '測試' },
    { account: '香港', password, nickname: '測試' },
    { account: 'WeakGuest', password: 'TEST1234', nickname: '測試' },
    { account: 'EmptyGuest', password, nickname: ' ' },
    { account: 'LongGuest', password, nickname: 'x'.repeat(61) },
    { account: 'NoPassword', nickname: '測試' },
  ]) assert.equal((await provision(request(input, cookie))).status, 400);
  assert.equal(await getAccount('WeakGuest'), null);
  assert.equal((await login(request({ action: 'register', phone: 'HK_NEW01', password, nickname: '測試', code: '123456' }))).status, 400);
});

test('simultaneous creation never overwrites the first customer', async () => {
  const created = await Promise.all([
    createManagedCustomer('RaceGuest', password, '第一位'),
    createManagedCustomer('raceguest', 'Other!Pass9', '第二位'),
  ]);
  assert.equal(created.filter(Boolean).length, 1);
  assert.equal((await getAccount('RaceGuest')).userId, created.find(Boolean).userId);
});
