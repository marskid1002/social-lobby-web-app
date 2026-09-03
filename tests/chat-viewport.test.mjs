import test from 'node:test';
import assert from 'node:assert/strict';

const { resolveChatViewport } = await import('@/lib/chat-viewport');

test('正常鍵盤 viewport 保留可見高度與位移', () => {
  assert.deepEqual(resolveChatViewport({
    visualHeight: 420,
    visualOffsetTop: 64,
    layoutHeight: 844,
  }), { height: 420, offsetTop: 64 });
});

test('WebKit 動畫期間的負位移與近零高度會被限制', () => {
  assert.deepEqual(resolveChatViewport({
    visualHeight: 12,
    visualOffsetTop: -84,
    layoutHeight: 844,
  }), { height: 180, offsetTop: 0 });
});

test('viewport 不得超過 layout viewport 或把 frame 推出畫面', () => {
  assert.deepEqual(resolveChatViewport({
    visualHeight: 900,
    visualOffsetTop: 500,
    layoutHeight: 844,
  }), { height: 844, offsetTop: 0 });
});

test('無效高度不套用 JavaScript frame，交回 CSS fallback', () => {
  assert.equal(resolveChatViewport({
    visualHeight: Number.NaN,
    visualOffsetTop: 0,
    layoutHeight: 844,
  }), null);
});
