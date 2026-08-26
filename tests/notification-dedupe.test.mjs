import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { unseenUpdatesForUser, updateIdsForUser } = await import('@/lib/notification-dedupe');

const updates = [
  { id: 'new-manager-update', userId: 'manager-1' },
  { id: 'old-manager-update', userId: 'manager-1' },
  { id: 'other-user-update', userId: 'user-2' },
];

test('重新整理建立基準時，可記住指定身份現有的全部通知 id', () => {
  assert.deepEqual(updateIdsForUser(updates, 'manager-1'), [
    'new-manager-update',
    'old-manager-update',
  ]);
});

test('只回傳指定身份尚未顯示過的新通知', () => {
  const seen = new Set(['old-manager-update']);
  assert.deepEqual(
    unseenUpdatesForUser(updates, 'manager-1', seen).map((update) => update.id),
    ['new-manager-update'],
  );
});

test('伺服器重新送回相同通知 id 時不會重播', () => {
  const seen = new Set(['new-manager-update', 'old-manager-update']);
  assert.deepEqual(unseenUpdatesForUser(updates, 'manager-1', seen), []);
});

test('NotificationWatcher 等首次同步完成，並以通知 id 而非數量判斷', async () => {
  const source = await readFile(new URL('../src/components/NotificationWatcher.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(!sharedSyncReady\) return/);
  assert.match(source, /unseenUpdatesForUser/);
  assert.doesNotMatch(source, /prevUpdateCountRef/);
});
