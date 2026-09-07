import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const apiSource = readFileSync(new URL('../src/app/api/case-messages/route.ts', import.meta.url), 'utf8');
const inboxSource = readFileSync(new URL('../src/app/(app)/inbox/page.tsx', import.meta.url), 'utf8');

test('案件 API 以官方訊息及原始回報人雙重驗證存取權限', () => {
  assert.ok(apiSource.includes('getSystemMessageForUser(userId, systemMessageId)'));
  assert.ok(apiSource.includes('record.reporterId !== userId'));
  assert.ok(apiSource.includes("return NextResponse.json({ error: 'not found' }, { status: 404 })"));
});

test('使用者回覆會綁定案件、重新開啟並通知 A000', () => {
  assert.ok(apiSource.includes("senderRole: 'reporter'"));
  assert.ok(apiSource.includes('setReportResolved(access.caseId, false)'));
  assert.ok(apiSource.includes('setIssueResolved(access.caseId, false)'));
  assert.ok(apiSource.includes("await getAccount('A000')"));
});

test('官方通知可顯示案件對話並讓使用者回覆管理員', () => {
  assert.ok(inboxSource.includes('/api/case-messages?systemMessageId='));
  assert.ok(inboxSource.includes('補充內容或回覆管理員…'));
  assert.ok(inboxSource.includes('回覆管理員'));
  assert.ok(inboxSource.includes('再次回覆會自動重新開啟'));
});
