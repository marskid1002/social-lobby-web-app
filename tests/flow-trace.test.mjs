// 第二階段事件追蹤儲存層測試。
// 執行：
// node --experimental-transform-types --import ./tests/loader.mjs --test tests/flow-trace.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const traceStore = await import('@/lib/flow-trace-store');

const REDIS = Boolean(
  process.env.KV_REST_API_URL
  || process.env.KV_URL
  || process.env.UPSTASH_REDIS_REST_URL
  || process.env.REDIS_URL
);
const skip = REDIS ? '偵測到 Redis 環境變數：跳過以免碰 production' : false;

test('同一個局在不同事件間沿用相同 traceId', { skip }, async () => {
  await traceStore.clearFlowTracesForTests();
  const first = await traceStore.recordFlowTrace({
    eventType: 'request.created',
    requestId: 'request-trace-1',
  });
  const second = await traceStore.recordFlowTrace({
    eventType: 'dispatch.created',
    requestId: 'request-trace-1',
  });
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.traceId, second.traceId);
});

test('穩定 dedupeKey 不會因同步快照重送而產生重複事件', { skip }, async () => {
  await traceStore.clearFlowTracesForTests();
  const input = {
    eventType: 'message.stored',
    requestId: 'request-trace-2',
    entityId: 'message-1',
    dedupeKey: 'message.stored:message-1',
  };
  assert.ok(await traceStore.recordFlowTrace(input));
  assert.equal(await traceStore.recordFlowTrace(input), null);
  const events = await traceStore.listFlowTraces({ requestId: 'request-trace-2' });
  assert.equal(events.length, 1);
});

test('搜尋只比對安全識別欄位，不保存聊天內容欄位', { skip }, async () => {
  await traceStore.clearFlowTracesForTests();
  await traceStore.recordFlowTrace({
    eventType: 'message.stored',
    requestId: 'request-trace-3',
    threadId: 'thread-safe',
    actorUserId: 'user-safe',
    entityId: 'message-safe',
    detail: 'text',
  });
  const events = await traceStore.listFlowTraces({ query: 'thread-safe' });
  assert.equal(events.length, 1);
  assert.equal('text' in events[0], false);
  assert.equal(JSON.stringify(events[0]).includes('聊天原文'), false);
});
