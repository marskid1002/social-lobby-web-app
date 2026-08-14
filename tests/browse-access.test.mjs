import test from 'node:test';
import assert from 'node:assert/strict';

const { onlineEscortLimitForTier } = await import('@/lib/browse-access');

test('付費功能未開放時，登入客戶可看 30 位小姐', () => {
  assert.equal(onlineEscortLimitForTier('standard'), 30);
  assert.equal(onlineEscortLimitForTier('premium'), 30);
});

test('訪客仍只看 3 位，VIP 維持不限數量', () => {
  assert.equal(onlineEscortLimitForTier('guest'), 3);
  assert.equal(onlineEscortLimitForTier('vip'), Infinity);
});
