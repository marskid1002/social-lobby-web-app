import test from 'node:test';
import assert from 'node:assert/strict';

const {
  appendCaseMessage,
  getCaseThread,
  setCaseStatus,
} = await import('@/lib/case-thread-store');

test('案件對話依管理員與回報人回覆切換狀態並保留歷程', async () => {
  const caseId = `test-${crypto.randomUUID()}`;
  const adminReply = await appendCaseMessage({
    kind: 'report',
    caseId,
    reporterId: 'u-reporter',
    senderId: 'u-admin',
    senderRole: 'admin',
    content: '請補充資料',
  });
  assert.equal(adminReply.status, 'waiting_reporter');
  assert.equal(adminReply.messages.length, 1);

  const reporterReply = await appendCaseMessage({
    kind: 'report',
    caseId,
    reporterId: 'u-reporter',
    senderId: 'u-reporter',
    senderRole: 'reporter',
    content: '補充內容',
  });
  assert.equal(reporterReply.status, 'reporter_replied');
  assert.equal(reporterReply.messages.length, 2);

  await setCaseStatus('report', caseId, 'u-reporter', 'resolved');
  const resolved = await getCaseThread('report', caseId);
  assert.equal(resolved?.status, 'resolved');
  assert.equal(resolved?.messages.length, 2);
});
