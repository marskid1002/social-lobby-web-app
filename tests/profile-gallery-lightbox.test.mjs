import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/app/(app)/u/[id]/page.tsx', import.meta.url), 'utf8');

test('相簿大圖開啟時鎖住背景捲動，關閉後還原', () => {
  assert.ok(source.includes("document.body.style.overflow = 'hidden'"));
  assert.ok(source.includes("document.body.style.overscrollBehavior = 'none'"));
  assert.ok(source.includes('document.body.style.overflow = previousOverflow'));
  assert.ok(source.includes('document.body.style.overscrollBehavior = previousOverscrollBehavior'));
});

test('多張相簿支援左右滑動、按鈕切換與鍵盤方向鍵', () => {
  assert.ok(source.includes('onTouchStart={handleLightboxTouchStart}'));
  assert.ok(source.includes('onTouchEnd={handleLightboxTouchEnd}'));
  assert.ok(source.includes('if (distance > 0) showPreviousPhoto()'));
  assert.ok(source.includes('else showNextPhoto()'));
  assert.ok(source.includes('aria-label="上一張照片"'));
  assert.ok(source.includes('aria-label="下一張照片"'));
  assert.ok(source.includes("event.key === 'ArrowLeft'"));
  assert.ok(source.includes("event.key === 'ArrowRight'"));
});
