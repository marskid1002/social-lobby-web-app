import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticCheck, diagnosticFailure } from '../src/lib/system-diagnostics.ts';
import { GET } from '../src/app/api/admin/diagnostics/route.ts';

test('診斷區分 DNS、授權與限流；不推定根因也不洩漏憑證', () => {
  assert.match(diagnosticFailure({ cause: { code: 'ENOTFOUND' } }), /DNS/);
  assert.match(diagnosticFailure({ $metadata: { httpStatusCode: 403 } }), /拒絕授權/);
  assert.match(diagnosticFailure({ status: 429 }), /不能單獨證明用量耗盡/);
  const error = new Error('secret-token https://private-service?password=secret');
  assert.doesNotMatch(diagnosticFailure(error), /secret|private-service/);
  assert.match(diagnosticFailure(error), /不足以確認根因/);
});

test('單一檢查失敗不影響其他檢查，並保留實際環節及時間', async () => {
  const results = await Promise.all([
    diagnosticCheck('one', '服務一', '讀取', async () => { throw { status: 403 }; }),
    diagnosticCheck('two', '服務二', '設定', async () => ({ status: 'unknown', detail: '尚未驗證', action: '檢查' })),
  ]);
  assert.equal(results[0].status, 'error');
  assert.equal(results[0].stage, '讀取');
  assert.equal(results[1].status, 'unknown');
  assert.ok(Number.isFinite(Date.parse(results[0].checkedAt)));
});

test('未登入不能執行詳細診斷', async () => {
  const response = await GET(new Request('http://localhost/api/admin/diagnostics'));
  assert.equal(response.status, 401);
});
