import test from 'node:test';
import assert from 'node:assert/strict';

const phone = await import('@/lib/phone');
const authStore = await import('@/lib/auth-store');

test('台灣手機三種格式統一成 09xxxxxxxx', () => {
  for (const input of ['0912345678', '886912345678', '+886912345678', '+886 912-345-678']) {
    assert.equal(phone.normalizeTaiwanMobile(input), '0912345678');
    assert.equal(phone.toTaiwanInternationalMobile(input), '886912345678');
  }
});

test('拒絕重複國碼、886 後多 0、長度錯誤與非手機內容', () => {
  for (const input of [
    '886886912345678',
    '+8860912345678',
    '8860912345678',
    '091234567',
    '09123456789',
    '0812345678',
    '09abc123456',
    '',
  ]) {
    assert.equal(phone.normalizeTaiwanMobile(input), '', input);
    assert.equal(phone.isTaiwanMobile(input), false, input);
  }
});

test('帳號建立、查找與重設跨 09／886／+886 使用同一帳號', async () => {
  const local = `09${String(Date.now()).slice(-8)}`;
  const international = `886${local.slice(1)}`;
  const created = await authStore.createCustomer(`+${international}`, 'Old!Pass1', '手機格式測試');
  assert.equal(created.key, local);
  assert.equal((await authStore.getAccount(local))?.userId, created.userId);
  assert.equal((await authStore.getAccount(international))?.userId, created.userId);
  assert.equal(await authStore.setCustomerPassword(`+${international}`, 'New!Pass2'), true);
  const updated = await authStore.getAccount(local);
  assert.equal(authStore.verifyPassword(updated, 'New!Pass2'), true);
});
