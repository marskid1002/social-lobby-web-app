// 維護模式測試：載入「真正的」production maintenance 模組，驗證開關、放行清單與 bypass 金鑰。
// 重點在「不留空門」：金鑰未設定或長度不足時，任何輸入都不得通過。
//
// 執行：node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/maintenance-mode.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('@/lib/maintenance');
const {
  MAINTENANCE_FLAG_IN_CODE,
  MAINTENANCE_HTML,
  BYPASS_COOKIE_NAME,
  BYPASS_COOKIE_VALUE,
  BYPASS_QUERY_PARAM,
  isMaintenanceMode,
  isAlwaysAllowedPath,
  isValidBypassKey,
  safeEqual,
} = mod;

/** 暫時覆寫環境變數並在測試後還原，避免污染其他測試。 */
function withEnv(patch, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(patch)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// ── 開關 ──────────────────────────────────────────────────────────────────────

test('環境變數 MAINTENANCE_MODE=1 / true → 進入維護模式', () => {
  withEnv({ MAINTENANCE_MODE: '1' }, () => assert.equal(isMaintenanceMode(), true));
  withEnv({ MAINTENANCE_MODE: 'true' }, () => assert.equal(isMaintenanceMode(), true));
});

test('MAINTENANCE_MODE 未設或為其他值 → 由程式碼開關決定', () => {
  withEnv({ MAINTENANCE_MODE: undefined }, () =>
    assert.equal(isMaintenanceMode(), MAINTENANCE_FLAG_IN_CODE),
  );
  // 「0」「off」等值不得意外開啟維護模式
  withEnv({ MAINTENANCE_MODE: '0' }, () =>
    assert.equal(isMaintenanceMode(), MAINTENANCE_FLAG_IN_CODE),
  );
  withEnv({ MAINTENANCE_MODE: 'off' }, () =>
    assert.equal(isMaintenanceMode(), MAINTENANCE_FLAG_IN_CODE),
  );
});

// ── 放行清單 ──────────────────────────────────────────────────────────────────

test('維護期間放行健康檢查與版本探測，其他一律不放行', () => {
  assert.equal(isAlwaysAllowedPath('/api/health'), true);
  assert.equal(isAlwaysAllowedPath('/api/version'), true);
  assert.equal(isAlwaysAllowedPath('/'), false);
  assert.equal(isAlwaysAllowedPath('/lobby/explore'), false);
  assert.equal(isAlwaysAllowedPath('/api/sync'), false);
  assert.equal(isAlwaysAllowedPath('/admin'), false);
  // 不可用前綴矇騙放行（避免 /api/healthcheck 之類意外通過）
  assert.equal(isAlwaysAllowedPath('/api/health/../sync'), false);
  assert.equal(isAlwaysAllowedPath('/api/healthz'), false);
  assert.equal(isAlwaysAllowedPath('/api/version/leak'), false);
});

// ── bypass 金鑰：不留空門 ─────────────────────────────────────────────────────

test('兩個金鑰都沒設定 → 任何輸入都不通過', () => {
  withEnv({ MAINTENANCE_BYPASS_KEY: undefined, ADMIN_SECRET: undefined }, () => {
    assert.equal(isValidBypassKey('anything'), false);
    assert.equal(isValidBypassKey(''), false);
    assert.equal(isValidBypassKey(null), false);
    assert.equal(isValidBypassKey(undefined), false);
  });
});

test('金鑰長度不足 8 → 視為未設定，連正確值也不通過', () => {
  withEnv({ MAINTENANCE_BYPASS_KEY: 'short', ADMIN_SECRET: undefined }, () => {
    assert.equal(isValidBypassKey('short'), false);
  });
});

test('正確的 MAINTENANCE_BYPASS_KEY → 通過；錯誤值 → 不通過', () => {
  withEnv({ MAINTENANCE_BYPASS_KEY: 'let-me-in-1234', ADMIN_SECRET: undefined }, () => {
    assert.equal(isValidBypassKey('let-me-in-1234'), true);
    assert.equal(isValidBypassKey('let-me-in-1235'), false);
    assert.equal(isValidBypassKey('let-me-in-123'), false);  // 少一字元
    assert.equal(isValidBypassKey('let-me-in-12345'), false); // 多一字元
    assert.equal(isValidBypassKey('LET-ME-IN-1234'), false);  // 大小寫需完全相符
  });
});

test('ADMIN_SECRET 可作為緊急 bypass（免先設定專用金鑰）', () => {
  withEnv({ MAINTENANCE_BYPASS_KEY: undefined, ADMIN_SECRET: 'admin-secret-value' }, () => {
    assert.equal(isValidBypassKey('admin-secret-value'), true);
    assert.equal(isValidBypassKey('admin-secret-valu'), false);
  });
});

test('兩個金鑰同時存在 → 任一相符即通過', () => {
  withEnv({ MAINTENANCE_BYPASS_KEY: 'primary-key-123', ADMIN_SECRET: 'admin-secret-value' }, () => {
    assert.equal(isValidBypassKey('primary-key-123'), true);
    assert.equal(isValidBypassKey('admin-secret-value'), true);
    assert.equal(isValidBypassKey('neither-of-them'), false);
  });
});

// ── 常數時間比較的正確性 ──────────────────────────────────────────────────────

test('safeEqual 只在完全相同時為 true', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('', ''), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'ab'), false);
  assert.equal(safeEqual('ab', 'abc'), false);
});

// ── 施工畫面：必須零外部依賴 ──────────────────────────────────────────────────

test('施工畫面含必要文案與 noindex', () => {
  assert.ok(MAINTENANCE_HTML.includes('系統維護中'));
  assert.ok(MAINTENANCE_HTML.includes('JUGA'));
  assert.ok(MAINTENANCE_HTML.includes('name="robots" content="noindex"'));
});

test('施工畫面不得引用任何外部資源（後端壞掉時仍須顯示得出來）', () => {
  // 不可有外部字型／圖片／腳本；也不可依賴 /_next 打包產物
  assert.equal(/https?:\/\//.test(MAINTENANCE_HTML), false, '不應出現外部 URL');
  assert.equal(MAINTENANCE_HTML.includes('/_next'), false, '不應依賴 _next 靜態資源');
  assert.equal(/<script/i.test(MAINTENANCE_HTML), false, '不應含 script');
  assert.equal(/<img/i.test(MAINTENANCE_HTML), false, '不應含外部圖片');
});

// ── 常數本身 ─────────────────────────────────────────────────────────────────

test('cookie 與 query 參數名稱不含金鑰本身語意', () => {
  assert.equal(BYPASS_COOKIE_NAME, 'juga_maintenance_bypass');
  assert.equal(BYPASS_COOKIE_VALUE, 'ok'); // cookie 值刻意不等於金鑰
  assert.equal(BYPASS_QUERY_PARAM, 'juga_key');
});
