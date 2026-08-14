import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeAppBadgeCount, syncAppBadge, totalAppUnreadCount } = await import('@/lib/app-badge');

test('app badge count is always a safe non-negative integer', () => {
  assert.equal(normalizeAppBadgeCount(7), 7);
  assert.equal(normalizeAppBadgeCount(3.9), 3);
  assert.equal(normalizeAppBadgeCount(-2), 0);
  assert.equal(normalizeAppBadgeCount(Number.NaN), 0);
  assert.equal(normalizeAppBadgeCount(Number.POSITIVE_INFINITY), 0);
});

test('app badge combines each unread source without unsafe values', () => {
  assert.equal(totalAppUnreadCount(2, 3, 4), 9);
  assert.equal(totalAppUnreadCount(2.8, -3, Number.NaN), 2);
});

test('app badge synchronization is safe during server rendering', () => {
  assert.doesNotThrow(() => syncAppBadge(4));
});
