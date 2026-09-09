import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticGuidance, formatDiagnosticReport } from '../src/lib/diagnostic-guidance.ts';

const check = { id: 'images', label: '圖片', status: 'error', stage: 'HTTP HEAD', detail: 'HTTP 404', action: '核對路徑', checkedAt: '2026-09-09T00:00:00Z' };

test('404 的操作指引區分檔案缺少與網域設定，缺漏設定提供實際名稱', () => {
  const guide = diagnosticGuidance({ ...check, sample: { escortId: 'g1', url: 'https://images.juga.com.tw/a.jpg', pathname: 'a.jpg', httpStatus: 404 } });
  assert.match(guide.steps.join('\n'), /若檔案不存在/);
  assert.match(guide.steps.join('\n'), /若檔案存在/);
  const missing = diagnosticGuidance({ ...check, id: 'sms', missingSettings: ['MSGDOGS_OTP_TEMPLATE_REGISTER'] });
  assert.match(missing.steps.join('\n'), /Settings → Environment Variables/);
  assert.match(missing.steps.join('\n'), /MSGDOGS_OTP_TEMPLATE_REGISTER/);
});

test('報告包含定位照片、時間及版本；不序列化未列出的敏感欄位', () => {
  const report = formatDiagnosticReport({ checks: [{ ...check, secret: 'secret-should-not-appear', sample: { escortId: 'g1', url: 'https://images.juga.com.tw/a.jpg', pathname: 'a.jpg', httpStatus: 404 } }], version: 'abc123', environment: 'production' });
  for (const value of ['abc123', 'production', check.checkedAt, 'g1', 'a.jpg', '404']) assert.ok(report.includes(value));
  assert.ok(!report.includes('secret-should-not-appear'));
});

test('無檢查結果時仍可匯出請求失敗報告', () => {
  const report = formatDiagnosticReport({ checks: [], version: 'abc123', environment: 'production', error: '診斷逾時' });
  assert.match(report, /診斷請求錯誤：診斷逾時/);
});
