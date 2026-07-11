/**
 * Web Push 訂閱儲存層（依使用者分組）。
 * - 本地開發（無 Upstash env）：存記憶體
 * - 生產環境：存 Upstash Redis
 *
 * 結構：{ [userId]: PushSubscription[] }
 * 同一個 endpoint 只屬於一個 userId（切換身份時會把它移到新的 userId）。
 */

import type { PushSubscription } from 'web-push';
import { getRedis, kvKey } from './kv';

const REDIS_KEY = kvKey('push_subs_by_user:v1');

type SubsByUser = Record<string, PushSubscription[]>;

const memStore: SubsByUser = {};

async function readAll(): Promise<SubsByUser> {
  const redis = getRedis();
  if (redis) {
    return ((await redis.get(REDIS_KEY)) as SubsByUser | null) ?? {};
  }
  return memStore;
}

async function writeAll(data: SubsByUser) {
  const redis = getRedis();
  if (redis) {
    await redis.set(REDIS_KEY, data);
  } else {
    // 記憶體模式：data 可能就是 memStore 本身的參考，先深拷貝再覆蓋，避免清空時把來源也清掉
    const snapshot: SubsByUser = JSON.parse(JSON.stringify(data));
    for (const k of Object.keys(memStore)) delete memStore[k];
    Object.assign(memStore, snapshot);
  }
}

/** 將訂閱綁定到 userId；同一 endpoint 會從其他 userId 移除（支援切換身份）。 */
export async function saveSubscription(userId: string, sub: PushSubscription) {
  const all = await readAll();
  // 先把此 endpoint 從所有 userId 移除
  for (const uid of Object.keys(all)) {
    all[uid] = (all[uid] ?? []).filter((s) => s.endpoint !== sub.endpoint);
  }
  // 再加到目標 userId
  all[userId] = [...(all[userId] ?? []), sub];
  await writeAll(all);
}

/** 移除失效訂閱（web-push 回傳 404/410 時呼叫），從所有 userId 清掉該 endpoint。 */
export async function removeSubscriptionByEndpoint(endpoint: string) {
  const all = await readAll();
  let changed = false;
  for (const uid of Object.keys(all)) {
    const before = all[uid]?.length ?? 0;
    all[uid] = (all[uid] ?? []).filter((s) => s.endpoint !== endpoint);
    if (all[uid].length !== before) changed = true;
    if (all[uid].length === 0) delete all[uid];
  }
  if (changed) await writeAll(all);
}

/** 移除某 userId 的所有推播訂閱（帳號刪除時用）。 */
export async function removeSubscriptionsForUser(userId: string) {
  const all = await readAll();
  if (all[userId]) {
    delete all[userId];
    await writeAll(all);
  }
}

/** 取得指定 userId 們的所有訂閱（去重）。 */
export async function getSubscriptionsForUsers(userIds: string[]): Promise<PushSubscription[]> {
  const all = await readAll();
  const result: PushSubscription[] = [];
  const seen = new Set<string>();
  for (const uid of userIds) {
    for (const sub of all[uid] ?? []) {
      if (!seen.has(sub.endpoint)) {
        seen.add(sub.endpoint);
        result.push(sub);
      }
    }
  }
  return result;
}
