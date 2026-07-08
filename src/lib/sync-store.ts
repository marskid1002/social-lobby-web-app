/**
 * 跨裝置共享狀態儲存層。
 * - 本地開發（無 Upstash env）：存在 Node.js 記憶體 → 同一個 dev server 的多個瀏覽器可同步
 * - 生產環境（有 Upstash env）：存在 Upstash Redis → 跨裝置 / 跨 serverless 實例同步
 *
 * 共享集合：requests / responses / invitations / updates / chatMessages
 * 合併策略：依 id upsert（新項目附加、既有項目以最新覆蓋），降低多端同時寫入的覆蓋風險。
 */

const REDIS_KEY = 'sl:shared:v1';

export type SharedKey = 'requests' | 'responses' | 'invitations' | 'updates' | 'chatMessages' | 'presence' | 'photoOverrides' | 'photoGalleries';
export const SHARED_KEYS: SharedKey[] = ['requests', 'responses', 'invitations', 'updates', 'chatMessages', 'presence', 'photoOverrides', 'photoGalleries'];

export type SharedState = Record<SharedKey, Array<{ id: string; [k: string]: unknown }>>;

function emptyShared(): SharedState {
  return { requests: [], responses: [], invitations: [], updates: [], chatMessages: [], presence: [], photoOverrides: [], photoGalleries: [] };
}

function getRedis() {
  // 支援 Upstash 原生整合與 Vercel KV(Redis) 整合的不同環境變數命名
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const { Redis } = require('@upstash/redis');
  return new Redis({ url, token });
}

// 本地記憶體 fallback（dev server 單一程序內共享）
const memStore: SharedState = emptyShared();

async function readAll(): Promise<SharedState> {
  const redis = getRedis();
  if (redis) {
    const raw = (await redis.get(REDIS_KEY)) as SharedState | null;
    return raw ? { ...emptyShared(), ...raw } : emptyShared();
  }
  return memStore;
}

async function writeAll(state: SharedState) {
  const redis = getRedis();
  if (redis) {
    await redis.set(REDIS_KEY, state);
  }
  // 記憶體模式直接改 memStore（已是同一參考）
}

/** 依 id 將 incoming 合併進 base（incoming 覆蓋同 id），回傳新陣列。 */
function upsertById(
  base: Array<{ id: string }>,
  incoming: Array<{ id: string }>
): Array<{ id: string }> {
  const map = new Map(base.map((item) => [item.id, item]));
  for (const item of incoming) {
    if (item && item.id) map.set(item.id, item);
  }
  return [...map.values()];
}

export async function getShared(): Promise<SharedState> {
  return readAll();
}

/** 將 patch（部分共享集合）依 id upsert 進儲存，回傳合併後的完整共享狀態。 */
export async function mergeShared(patch: Partial<SharedState>): Promise<SharedState> {
  const current = await readAll();
  const next = emptyShared();
  for (const key of SHARED_KEYS) {
    const incoming = patch[key];
    next[key] = (incoming
      ? upsertById(current[key] ?? [], incoming)
      : current[key] ?? []) as SharedState[SharedKey];
  }
  // 記憶體模式：同步更新 memStore 內容
  if (!getRedis()) {
    for (const key of SHARED_KEYS) memStore[key] = next[key];
  } else {
    await writeAll(next);
  }
  return next;
}

/** 清空所有共享資料（重設 demo 用）。 */
export async function clearShared(): Promise<void> {
  const empty = emptyShared();
  const redis = getRedis();
  if (redis) {
    await redis.set(REDIS_KEY, empty);
  } else {
    for (const key of SHARED_KEYS) memStore[key] = [];
  }
}
