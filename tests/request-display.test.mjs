import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { requestDisplayState } = await import('@/lib/request-display');

const NOW = Date.parse('2026-08-26T12:00:00.000Z');

test('客戶首頁只有 open 且未過期的局顯示為進行中', () => {
  assert.deepEqual(
    requestDisplayState({ status: 'open', expiresAt: '2026-08-26T12:00:01.000Z' }, NOW),
    { active: true },
  );
  assert.deepEqual(
    requestDisplayState({ status: 'open', expiresAt: '2026-08-26T12:00:00.000Z' }, NOW),
    { active: false, label: '已過期' },
  );
  assert.deepEqual(
    requestDisplayState({ status: 'open', expiresAt: 'not-a-date' }, NOW),
    { active: false, label: '已過期' },
  );
});

test('closed 的局即使資料為聊天室保留，仍顯示為已結束', () => {
  assert.deepEqual(
    requestDisplayState({ status: 'closed', expiresAt: '2999-01-01T00:00:00.000Z' }, NOW),
    { active: false, label: '已結束' },
  );
});

test('客戶首頁不再顯示舊群組聊天文字', async () => {
  const source = await readFile('src/app/(app)/lobby/explore/page.tsx', 'utf8');
  assert.equal(source.includes('查看群組聊天'), false);
  assert.equal(source.includes('查看聊天紀錄'), true);
});
