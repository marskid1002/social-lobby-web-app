import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { authorizeWrites, buildIndex } = await import('@/lib/sync-authz');
const { summarizeSmsRuntime } = await import('@/lib/sms-runtime');

const NOW = Date.parse('2026-08-27T12:00:00.000Z');
const CA = '2026-08-27T10:00:00.000Z';
const session = { userId: 'A', role: 'user', tier: 'standard', sessionVersion: 1 };
const run = (patch, cols = {}) => authorizeWrites(patch, session, buildIndex(cols), NOW);
const validBlob = 'https://store-1.public.blob.vercel-storage.com/uploads/A/image/123e4567-e89b-42d3-a456-426614174000.jpg';

test('廣場新貼文只接受本站 Blob 圖片，純文字仍可發', () => {
  assert.deepEqual(run({ momentPosts: [{ id: 'external', authorId: 'A', content: '', imageUrl: 'https://tracker.example/pixel.gif' }] }).momentPosts, []);
  assert.deepEqual(run({ momentPosts: [{ id: 'data', authorId: 'A', content: '', imageUrl: 'data:image/png;base64,abc' }] }).momentPosts, []);
  assert.equal(run({ momentPosts: [{ id: 'blob', authorId: 'A', content: '', imageUrl: validBlob }] }).momentPosts.length, 1);
  assert.equal(run({ momentPosts: [{ id: 'text', authorId: 'A', content: '純文字' }] }).momentPosts.length, 1);
});

test('歷史外部圖片貼文仍可更新計數，不會被新規則鎖死', () => {
  const existing = { id: 'old', authorId: 'A', content: '舊貼文', imageUrl: 'https://legacy.example/photo.jpg', likeCount: 0 };
  const result = run({ momentPosts: [{ id: 'old', authorId: 'A', likeCount: 1 }] }, { momentPosts: [existing] }).momentPosts[0];
  assert.equal(result.imageUrl, existing.imageUrl);
  assert.equal(result.likeCount, 1);
});

test('新局地點須為選單內行政區，任意文字會被拒絕', () => {
  const base = { creatorId: 'A', requestType: 'other', venueType: 'bar', createdAt: CA };
  assert.equal(run({ requests: [{ id: 'valid', ...base, area: '信義區' }] }).requests.length, 1);
  assert.equal(run({ requests: [{ id: 'legacy', ...base, area: '西門町' }] }).requests.length, 1);
  assert.deepEqual(run({ requests: [{ id: 'invalid', ...base, area: '火星區' }] }).requests, []);
});

test('SMS 後台摘要以最近一次結果顯示，並統計近 24 小時失敗', () => {
  const events = [
    { id: '2', traceId: 't2', eventType: 'sms.otp', outcome: 'failure', code: 'provider_rejected', createdAt: '2026-08-27T11:00:00.000Z' },
    { id: '1', traceId: 't1', eventType: 'sms.otp', outcome: 'success', createdAt: '2026-08-27T10:00:00.000Z' },
    { id: 'old', traceId: 't0', eventType: 'sms.otp', outcome: 'failure', createdAt: '2026-08-25T10:00:00.000Z' },
  ];
  assert.deepEqual(summarizeSmsRuntime(events, NOW), {
    state: 'degraded',
    attempts24h: 2,
    failures24h: 1,
    lastAttemptAt: '2026-08-27T11:00:00.000Z',
    lastSuccessAt: '2026-08-27T10:00:00.000Z',
    lastFailureAt: '2026-08-27T11:00:00.000Z',
    lastFailureCode: 'provider_rejected',
    history: [
      {
        id: '2',
        createdAt: '2026-08-27T11:00:00.000Z',
        outcome: 'failure',
        purpose: 'unknown',
        code: 'provider_rejected',
      },
      {
        id: '1',
        createdAt: '2026-08-27T10:00:00.000Z',
        outcome: 'success',
        purpose: 'unknown',
      },
      {
        id: 'old',
        createdAt: '2026-08-25T10:00:00.000Z',
        outcome: 'failure',
        purpose: 'unknown',
      },
    ],
  });
});

test('SMS 發送歷程顯示用途與客戶 ID，但不包含詳細傳送內容', () => {
  const status = summarizeSmsRuntime([{
    id: 'sms-1',
    traceId: 'trace-1',
    eventType: 'sms.otp',
    outcome: 'success',
    actorUserId: 'c-customer',
    entityId: 'reset',
    detail: 'provider=msgdogs;purpose=reset;http=200',
    createdAt: '2026-08-27T11:30:00.000Z',
  }], NOW);
  assert.deepEqual(status.history, [{
    id: 'sms-1',
    createdAt: '2026-08-27T11:30:00.000Z',
    outcome: 'success',
    purpose: 'reset',
    userId: 'c-customer',
  }]);
});

test('聊天照片上傳明確標記為 chat 類型', () => {
  const source = readFileSync(new URL('../src/lib/image.ts', import.meta.url), 'utf8');
  assert.ok(source.includes("kind: 'chat'"));
});
