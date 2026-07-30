import test from 'node:test';
import assert from 'node:assert/strict';

const authStore = await import('@/lib/auth-store');
const { POST } = await import('@/app/api/auth/route');
const { requireActiveSession } = await import('@/lib/active-session');
const { listDeviceSummaries } = await import('@/lib/device-store');
const { saveSubscription, getSubscriptionsForUsers } = await import('@/lib/push-store');

let sequence = 93000000;

function request(body, cookie = '', userAgent = 'single-device-test') {
  return new Request('http://localhost/api/auth', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `198.51.100.${sequence % 200}`,
      'user-agent': userAgent,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function sessionCookie(response) {
  const setCookie = response.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/sl_session=([^;,]+)/);
  assert.ok(match, `缺少 session cookie：${setCookie}`);
  return `sl_session=${match[1]}`;
}

async function active(cookie) {
  return requireActiveSession(new Request('http://localhost/api/sync', {
    headers: { cookie },
  }));
}

test('客戶第二次登入會撤銷第一次 JWT、舊裝置與舊 Push 訂閱', async () => {
  const phone = `09${sequence++}`;
  const password = 'Pw!23456';
  const account = await authStore.createCustomer(phone, password, '單裝置客戶');

  const first = await POST(request({ action: 'login', account: phone, password }, '', 'device-one'));
  assert.equal(first.status, 200);
  const firstCookie = sessionCookie(first);
  assert.equal((await active(firstCookie)).ok, true);

  await saveSubscription(account.userId, {
    endpoint: 'https://push.example/old-device',
    keys: { auth: 'old-auth', p256dh: 'old-key' },
  });
  assert.equal((await getSubscriptionsForUsers([account.userId])).length, 1);

  const second = await POST(request({ action: 'login', account: `+886${phone.slice(1)}`, password }, '', 'device-two'));
  assert.equal(second.status, 200);
  const secondCookie = sessionCookie(second);

  const oldResult = await active(firstCookie);
  assert.equal(oldResult.ok, false);
  assert.equal(oldResult.response.status, 401);
  assert.equal((await active(secondCookie)).ok, true);
  assert.equal((await getSubscriptionsForUsers([account.userId])).length, 0);

  const summary = (await listDeviceSummaries()).find((item) => item.userId === account.userId);
  assert.equal(summary?.count, 1);
  assert.deepEqual(summary?.userAgents, ['device-two']);
});

test('幹部重複登入不輪替 sessionVersion，兩個 JWT 都維持有效', async () => {
  const created = await authStore.createManagerAccount('多裝置幹部');
  const password = 'Pw!23456';
  const activate = await POST(request({
    action: 'login',
    account: created.account.key,
    password,
    activationCode: created.activationCode,
  }, '', 'manager-one'));
  assert.equal(activate.status, 200);
  const firstCookie = sessionCookie(activate);

  const second = await POST(request({
    action: 'login',
    account: created.account.key,
    password,
  }, '', 'manager-two'));
  assert.equal(second.status, 200);
  const secondCookie = sessionCookie(second);

  assert.equal((await active(firstCookie)).ok, true);
  assert.equal((await active(secondCookie)).ok, true);
  const summary = (await listDeviceSummaries()).find((item) => item.userId === created.account.userId);
  assert.equal(summary?.count, 2);
});
