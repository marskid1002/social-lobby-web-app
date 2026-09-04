import test from 'node:test';
import assert from 'node:assert/strict';

const { queryAdminAccounts } = await import('@/lib/admin-account-directory');

function account(key, role, userId, nickname) {
  return {
    key,
    role,
    tier: role === 'manager' ? 'vip' : role === 'user' ? 'standard' : 'admin',
    userId,
    nickname,
    salt: 'salt',
    hash: 'hash',
    createdAt: '2026-09-04T00:00:00.000Z',
  };
}

const accounts = [
  account('0912345678', 'user', 'customer-1', '王小明'),
  account('A001', 'manager', 'manager-1', '陳幹部'),
  account('A000', 'admin', 'admin-1', '管理員'),
  account('A777', 'account_viewer', 'viewer-1', '幹部稽查員'),
  account('A888', 'account_admin', 'account-admin-1', '幹部帳號管理員'),
];

test('A000 可用完整手機搜尋，但帳號目錄只回傳遮罩號碼', () => {
  const result = queryAdminAccounts(accounts, { group: 'user', q: '0912345678' });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].key, '091****678');
  assert.equal(result.items[0].accountRef, 'customer-1');
  assert.equal(JSON.stringify(result).includes('0912345678'), false);
});

test('帳號目錄正確拆分幹部、用戶與管理帳號', () => {
  const result = queryAdminAccounts(accounts, { group: 'staff' });
  assert.deepEqual(result.counts, { manager: 1, user: 1, staff: 3 });
  assert.deepEqual(result.items.map((item) => item.key), ['A000', 'A777', 'A888']);
  assert.equal(result.items.every((item) => ['admin', 'account_viewer', 'account_admin'].includes(item.role)), true);
});
