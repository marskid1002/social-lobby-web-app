import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldRedirectExpiredSession } from '@/lib/session-redirect';

test('登入與登出頁的 401 不會再次觸發登出循環', () => {
  assert.equal(shouldRedirectExpiredSession(401, '/login'), false);
  assert.equal(shouldRedirectExpiredSession(401, '/logout'), false);
});

test('已登入功能遇到 401 時仍會踢回登入頁', () => {
  assert.equal(shouldRedirectExpiredSession(401, '/lobby/explore'), true);
  assert.equal(shouldRedirectExpiredSession(401, '/chat/thread-1'), true);
});

test('非 401 回應不會觸發 session 過期導向', () => {
  assert.equal(shouldRedirectExpiredSession(403, '/lobby/explore'), false);
  assert.equal(shouldRedirectExpiredSession(500, '/lobby/explore'), false);
});
