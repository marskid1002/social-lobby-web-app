import test from 'node:test';
import assert from 'node:assert/strict';

const { ALL_AREA_DISTRICTS, AREA_CITIES, AREA_OPTIONS, cityForArea } = await import('@/lib/area-options');

test('發布邀請的縣市選單只提供台北市與新北市', () => {
  assert.deepEqual(AREA_CITIES, ['台北市', '新北市']);
});

test('行政區會對應正確縣市', () => {
  assert.equal(cityForArea('信義區'), '台北市');
  assert.equal(cityForArea('板橋區'), '新北市');
  assert.ok(AREA_OPTIONS.台北市.includes('文山區'));
  assert.ok(AREA_OPTIONS.新北市.includes('烏來區'));
  assert.ok(!AREA_OPTIONS.台北市.includes('板橋區'));
});

test('用戶所在地與發局共用完整且不重複的行政區清單', () => {
  const expected = AREA_CITIES.flatMap((city) => [...AREA_OPTIONS[city]]);
  assert.deepEqual(ALL_AREA_DISTRICTS, expected);
  assert.equal(new Set(ALL_AREA_DISTRICTS).size, ALL_AREA_DISTRICTS.length);
  assert.equal(ALL_AREA_DISTRICTS.length, 41);
});

test('既有西門町資料仍歸在台北市，不會因編輯而失去縣市', () => {
  assert.equal(cityForArea('西門町'), '台北市');
});
