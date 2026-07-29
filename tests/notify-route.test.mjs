// G：舊 /api/notify 不得再接受 client 指定 userIds/title/body/url。
// 執行：node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/notify-route.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const { POST } = await import('@/app/api/notify/route');
const { createCustomer } = await import('@/lib/auth-store');
const { signSession } = await import('@/lib/session');

test('/api/notify 拒絕登入者指定任意推播收件人', async () => {
  const account = await createCustomer('0966888001', 'Pw!23456', 'notify-tester');
  const token = await signSession({
    userId: account.userId,
    role: account.role,
    tier: account.tier,
    sessionVersion: account.sessionVersion ?? 0,
  });
  const request = new Request('http://localhost/api/notify', {
    method: 'POST',
    headers: {
      cookie: `sl_session=${encodeURIComponent(token)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      userIds: ['victim'],
      title: '偽造標題',
      body: '偽造內容',
      url: '/chat/fake',
    }),
  });
  const response = await POST(request);
  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    error: 'direct push targets are not allowed',
  });
});

test('/api/notify 未登入仍回 401', async () => {
  const request = new Request('http://localhost/api/notify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userIds: ['victim'] }),
  });
  const response = await POST(request);
  assert.equal(response.status, 401);
});
