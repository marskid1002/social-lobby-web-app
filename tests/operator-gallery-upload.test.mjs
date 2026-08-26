import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/OperatorHome.tsx', import.meta.url), 'utf8');

test('幹部相簿可一次選取多張，大頭照仍只處理一張', () => {
  assert.match(source, /accept="image\/\*"[\s\S]*?multiple/);
  assert.ok(source.includes('const selectedFiles = Array.from(e.target.files ?? [])'));
  assert.ok(source.includes("mode === 'avatar' ? selectedFiles.slice(0, 1) : selectedFiles"));
  assert.ok(source.includes('for (const [index, file] of files.entries())'));
});

test('多張照片逐張上傳，並回報進度及部分失敗張數', () => {
  assert.ok(source.includes('setUploadProgress({ current: index + 1, total: files.length })'));
  assert.ok(source.includes('savedCount += 1'));
  assert.ok(source.includes('${errors.length} 張失敗'));
  assert.ok(source.includes('新增照片（可多選）'));
});
