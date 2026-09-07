import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const explore = readFileSync(new URL('../src/app/(app)/lobby/explore/page.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/app/admin/page.tsx', import.meta.url), 'utf8');

test('小姐名單一次顯示 20 位並在接近底部時繼續載入', () => {
  assert.ok(explore.includes('const ESCORT_BATCH_SIZE = 20'));
  assert.ok(explore.includes('new IntersectionObserver'));
  assert.ok(explore.includes('current + ESCORT_BATCH_SIZE'));
  assert.ok(explore.includes('ids.slice(0, visibleCount)'));
});

test('首屏圖片優先，其餘圖片延遲載入並非同步解碼', () => {
  assert.ok(explore.includes("loading={priority ? 'eager' : 'lazy'}"));
  assert.ok(explore.includes("fetchPriority={priority ? 'high' : 'auto'}"));
  assert.ok(explore.includes('decoding="async"'));
  assert.ok(admin.includes("loading={escortIndex < GALLERY_EAGER_IMAGE_COUNT ? 'eager' : 'lazy'}"));
});

test('A000 相簿名單不預載相簿縮圖，只在點擊後顯示目前照片', () => {
  assert.ok(admin.includes('const GALLERY_BATCH_SIZE = 20'));
  assert.ok(admin.includes('查看相簿（{images.length} 張）'));
  assert.equal(admin.includes('images.map((url, index)'), false);
  assert.ok(admin.includes('src={images[index]}'));
});

test('舊照片搬移成功後會立即重新取得後台資料', () => {
  assert.ok(admin.includes('if (migrated > 0) await load();'));
});
