/**
 * 跨裝置共享狀態儲存層（B 資料層：原子寫入版）。
 * 每個集合存成一個 Redis Hash（field = 項目 id，value = 項目 JSON），
 * 寫入用 HSET（逐項原子），避免「單一 key read-modify-write」的併發覆蓋（lost update）。
 * 本地開發（無 Redis）用記憶體 fallback。
 */

const KEY_PREFIX = 'sl:h:v1:'; // 每個集合一個 hash：sl:h:v1:requests ...

export type SharedKey =
  | 'requests' | 'responses' | 'invitations' | 'updates' | 'chatMessages'
  | 'presence' | 'photoOverrides' | 'photoGalleries' | 'registeredUsers';

export const SHARED_KEYS: SharedKey[] = [
  'requests', 'responses', 'invitations', 'updates', 'chatMessages',
  'presence', 'photoOverrides', 'photoGalleries', 'registeredUsers',
];

type Item = { id: string; [k: string]: unknown };
export type SharedState = Record<SharedKey, Item[]>;

function emptyShared(): SharedState {
  return {
    requests: [], responses: [], invitations: [], updates: [], chatMessages: [],
    presence: [], photoOverrides: [], photoGalleries: [], registeredUsers: [],
  };
}

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const { Redis } = require('@upstash/redis');
  return new Redis({ url, token });
}

// 記憶體 fallback：{ collection: { id: item } }
const mem: Record<SharedKey, Record<string, Item>> = {
  requests: {}, responses: {}, invitations: {}, updates: {}, chatMessages: {},
  presence: {}, photoOverrides: {}, photoGalleries: {}, registeredUsers: {},
};

function parseItem(v: unknown): Item | null {
  if (v == null) return null;
  if (typeof v === 'object') return v as Item;
  try { return JSON.parse(String(v)) as Item; } catch { return null; }
}

export async function getShared(): Promise<SharedState> {
  const redis = getRedis();
  const out = emptyShared();
  if (redis) {
    for (const key of SHARED_KEYS) {
      const h = (await redis.hgetall(KEY_PREFIX + key)) as Record<string, unknown> | null;
      if (h) out[key] = Object.values(h).map(parseItem).filter(Boolean) as Item[];
    }
  } else {
    for (const key of SHARED_KEYS) out[key] = Object.values(mem[key]);
  }
  return out;
}

/** 依 id 逐項 upsert（HSET 原子）；回傳合併後完整共享狀態。 */
export async function mergeShared(patch: Partial<SharedState>): Promise<SharedState> {
  const redis = getRedis();
  for (const key of SHARED_KEYS) {
    const items = patch[key];
    if (!items || !items.length) continue;
    if (redis) {
      const obj: Record<string, Item> = {};
      for (const it of items) if (it && it.id) obj[it.id] = it;
      if (Object.keys(obj).length) await redis.hset(KEY_PREFIX + key, obj); // 逐 field 原子寫入
    } else {
      for (const it of items) if (it && it.id) mem[key][it.id] = it;
    }
  }
  return getShared();
}

/** 從某集合刪除一筆（跨裝置刪除用）。 */
export async function deleteSharedItem(key: SharedKey, id: string): Promise<void> {
  const redis = getRedis();
  if (redis) await redis.hdel(KEY_PREFIX + key, id);
  else delete mem[key][id];
}

export async function clearShared(): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.del(...SHARED_KEYS.map((k) => KEY_PREFIX + k));
  } else {
    for (const key of SHARED_KEYS) mem[key] = {};
  }
}
