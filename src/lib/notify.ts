/**
 * 觸發 Web Push 推播（呼叫 /api/notify），只送給指定的使用者。
 * 失敗時靜默忽略，不影響主流程。
 */
export async function sendPushNotification(
  targetUserIds: string | string[],
  title: string,
  body: string,
  url = '/'
) {
  const userIds = Array.isArray(targetUserIds) ? targetUserIds : [targetUserIds];
  if (userIds.length === 0) return;
  try {
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds, title, body, url }),
    });
  } catch {
    // push 失敗不影響主功能
  }
}
