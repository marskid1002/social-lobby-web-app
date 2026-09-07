import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/app/admin/page.tsx', import.meta.url), 'utf8');

test('問題回報與使用者檢舉都能帶入正確回覆對象', () => {
  assert.ok(source.includes('回覆回報人'));
  assert.ok(source.includes('回覆檢舉人'));
  assert.ok(source.includes('recipientId: issue.reporterId'));
  assert.ok(source.includes('recipientId: report.reporterId'));
});

test('回覆入口會預填案件資料並切換到系統訊息', () => {
  assert.ok(source.includes('setMessageRecipientId(recipient.userId)'));
  assert.ok(source.includes('setMessageTitle(`關於您的${label}`)'));
  assert.ok(source.includes('案件編號：${referenceId}'));
  assert.ok(source.includes("setTab('messages')"));
  assert.ok(source.includes('setReportReplyContext({ kind, referenceId, recipientId: recipient.userId })'));
});

test('停用或不存在的回報帳號不會誤送給其他人', () => {
  assert.ok(source.includes("showToast('找不到可接收訊息的回報帳號，可能已停用或刪除')"));
  assert.ok(source.includes('if (!recipient)'));
});

test('案件回覆會固定收件人並保持案件開啟等待使用者回覆', () => {
  assert.ok(source.includes('disabled={reportReplyContext !== null}'));
  assert.ok(source.includes('caseKind: reportReplyContext.kind'));
  assert.ok(source.includes('caseId: reportReplyContext.referenceId'));
  assert.ok(source.includes('回覆已送出，案件正在等待使用者回覆'));
  assert.equal(source.includes('回覆已送出，案件已自動標記為已處理'), false);
});

test('A000 可在原案件卡查看完整往來與案件狀態', () => {
  assert.ok(source.includes('案件對話（{thread.messages.length} 則）'));
  assert.ok(source.includes("reporter_replied: { label: '使用者已回覆'"));
  assert.ok(source.includes("waiting_reporter: { label: '等待使用者回覆'"));
});
