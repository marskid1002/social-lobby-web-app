/**
 * PushSubscription 儲存層。
 * - 本地開發（無 Upstash env）：存在 Node.js 記憶體（重啟會清空）
 * - 生產環境（有 Upstash env）：存在 Upstash Redis
 */

import type { PushSubscription } from 'web-push';

const REDIS_KEY = 'push_subscriptions';

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  // 動態 import 避免 build 時報錯
  const { Redis } = require('@upstash/redis');
  return new Redis({ url, token });
}

// 本地記憶體 fallback
const memStore: PushSubscription[] = [];

export async function saveSubscription(sub: PushSubscription) {
  const redis = getRedis();
  if (redis) {
    // 用 endpoint 當 key 做 dedup
    const existing: PushSubscription[] = (await redis.get(REDIS_KEY)) ?? [];
    const deduped = existing.filter((s) => s.endpoint !== sub.endpoint);
    await redis.set(REDIS_KEY, [...deduped, sub]);
  } else {
    const idx = memStore.findIndex((s) => s.endpoint === sub.endpoint);
    if (idx >= 0) memStore[idx] = sub;
    else memStore.push(sub);
  }
}

export async function getAllSubscriptions(): Promise<PushSubscription[]> {
  const redis = getRedis();
  if (redis) {
    return (await redis.get(REDIS_KEY)) ?? [];
  }
  return [...memStore];
}
