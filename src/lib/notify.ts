/**
 * 觸發 Web Push 推播（呼叫 /api/notify）。
 * 失敗時靜默忽略，不影響主流程。
 */
export async function sendPushNotification(
  title: string,
  body: string,
  url = '/'
) {
  try {
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, url }),
    });
  } catch {
    // push 失敗不影響主功能
  }
}
