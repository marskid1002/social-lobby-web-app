import test from 'node:test';
import assert from 'node:assert/strict';

const {
  countHiddenSelections,
  filterDispatchRoster,
  filterRosterBySearch,
  normalizeRosterSearch,
} = await import('@/lib/roster-search');

const members = [
  { id: 'esc-A010-001', nickname: '晴晴', phone: '0912345678' },
  { id: 'esc-A010-002', nickname: '小晴', phone: '0987654321' },
  { id: 'esc-A010-003', nickname: '安妮', phone: '0900000000' },
];

test('人員搜尋支援中文部分名稱、前後空白與大小寫人員編號', () => {
  assert.deepEqual(filterRosterBySearch(members, ' 晴 ').map((item) => item.id), [
    'esc-A010-001',
    'esc-A010-002',
  ]);
  assert.deepEqual(filterRosterBySearch(members, 'a010-003').map((item) => item.nickname), ['安妮']);
  assert.equal(normalizeRosterSearch(' ESC-A010 '), 'esc-a010');
});

test('空搜尋保留本人完整名單，且不搜尋電話等敏感欄位', () => {
  assert.equal(filterRosterBySearch(members, ''), members);
  assert.deepEqual(filterRosterBySearch(members, '0912345678'), []);
});

test('安排名單可切換全部、可安排與已選擇，搜尋不會改動已選集合', () => {
  const selected = new Set(['esc-A010-001', 'esc-A010-003']);
  const unavailable = new Set(['esc-A010-002']);

  assert.deepEqual(
    filterDispatchRoster(members, '', 'available', selected, unavailable).map((item) => item.id),
    ['esc-A010-001', 'esc-A010-003'],
  );
  assert.deepEqual(
    filterDispatchRoster(members, '安', 'selected', selected, unavailable).map((item) => item.id),
    ['esc-A010-003'],
  );
  assert.deepEqual([...selected], ['esc-A010-001', 'esc-A010-003']);
});

test('搜尋或篩選隱藏已選人員時可正確提示數量', () => {
  assert.equal(
    countHiddenSelections(['esc-A010-001', 'esc-A010-003'], [members[2]]),
    1,
  );
});
