import webpush from 'web-push';
import { getSubscriptionsForUsers, removeSubscriptionByEndpoint } from './push-store';

const MAX_RECIPIENTS = 50;
const MAX_TITLE = 100;
const MAX_BODY = 300;

let vapidReady = false;

function ensureVapid(): boolean {
  if (vapidReady) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL ?? 'mailto:demo@sociallobby.app',
    publicKey,
    privateKey,
  );
  vapidReady = true;
  return true;
}

export interface PushResult {
  sent: number;
  total?: number;
  cleaned?: number;
  skipped?: string;
}

export interface PushOptions {
  badgeKey?: string;
}

/** Server-only push sender. Call only after the related server write has succeeded. */
export async function sendWebPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  url = '/',
  options: PushOptions = {},
): Promise<PushResult> {
  const targetIds = [...new Set(userIds.map(String).filter(Boolean))].slice(0, MAX_RECIPIENTS);
  if (targetIds.length === 0) return { sent: 0, skipped: 'no target users' };
  if (!ensureVapid()) return { sent: 0, skipped: 'vapid not configured' };

  const safeTitle = String(title ?? '').slice(0, MAX_TITLE);
  const safeBody = String(body ?? '').slice(0, MAX_BODY);
  const safeUrl = typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/';
  const subscriptions = await getSubscriptionsForUsers(targetIds);
  if (subscriptions.length === 0) return { sent: 0 };

  const safeBadgeKey = typeof options.badgeKey === 'string' && options.badgeKey.length <= 256
    ? options.badgeKey
    : undefined;
  const payload = JSON.stringify({
    title: safeTitle,
    body: safeBody,
    url: safeUrl,
    ...(safeBadgeKey ? { badgeKey: safeBadgeKey } : {}),
  });
  const results = await Promise.allSettled(
    subscriptions.map((subscription) => webpush.sendNotification(subscription, payload)),
  );

  const stale: string[] = [];
  results.forEach((result, index) => {
    if (result.status !== 'rejected') return;
    const code = (result.reason as { statusCode?: number })?.statusCode;
    if (code === 404 || code === 410) stale.push(subscriptions[index].endpoint);
  });
  if (stale.length > 0) {
    await Promise.allSettled(stale.map((endpoint) => removeSubscriptionByEndpoint(endpoint)));
  }

  return {
    sent: results.filter((result) => result.status === 'fulfilled').length,
    total: subscriptions.length,
    cleaned: stale.length,
  };
}
