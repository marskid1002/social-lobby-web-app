/**
 * 跨裝置共享狀態儲存層（B 資料層：原子寫入版）。
 * 每個集合存成一個 Redis Hash（field = 項目 id，value = 項目 JSON），
 * 寫入用 HSET（逐項原子），避免「單一 key read-modify-write」的併發覆蓋（lost update）。
 * 本地開發（無 Redis）用記憶體 fallback。
 */

import { getRedis, kvKey, warnIfRedisMissingInProd } from './kv';

warnIfRedisMissingInProd(); // 生產環境缺 Redis → 冷啟動時大聲警告（資料不會持久化）

const hashKey = (col: string) => kvKey(`sl:h:v1:${col}`); // 每集合一個 hash（含環境前綴）

export type SharedKey =
  | 'requests' | 'responses' | 'invitations' | 'updates' | 'chatMessages'
  | 'presence' | 'photoOverrides' | 'photoGalleries' | 'registeredUsers' | 'blocks' | 'escorts';

export const SHARED_KEYS: SharedKey[] = [
  'requests', 'responses', 'invitations', 'updates', 'chatMessages',
  'presence', 'photoOverrides', 'photoGalleries', 'registeredUsers', 'blocks', 'escorts',
];

type Item = { id: string; [k: string]: unknown };
export type SharedState = Record<SharedKey, Item[]>;

function emptyShared(): SharedState {
  return {
    requests: [], responses: [], invitations: [], updates: [], chatMessages: [],
    presence: [], photoOverrides: [], photoGalleries: [], registeredUsers: [], blocks: [], escorts: [],
  };
}

// 記憶體 fallback：{ collection: { id: item } }
const mem: Record<SharedKey, Record<string, Item>> = {
  requests: {}, responses: {}, invitations: {}, updates: {}, chatMessages: {},
  presence: {}, photoOverrides: {}, photoGalleries: {}, registeredUsers: {}, blocks: {}, escorts: {},
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
      const h = (await redis.hgetall(hashKey(key))) as Record<string, unknown> | null;
      if (h) out[key] = Object.values(h).map(parseItem).filter(Boolean) as Item[];
    }
  } else {
    for (const key of SHARED_KEYS) out[key] = Object.values(mem[key]);
  }
  return out;
}

/** 取單一集合（授權檢查用，避免抓全部）。 */
export async function getCollection(key: SharedKey): Promise<Item[]> {
  const redis = getRedis();
  if (redis) {
    const h = (await redis.hgetall(hashKey(key))) as Record<string, unknown> | null;
    return h ? (Object.values(h).map(parseItem).filter(Boolean) as Item[]) : [];
  }
  return Object.values(mem[key]);
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
      if (Object.keys(obj).length) await redis.hset(hashKey(key), obj); // 逐 field 原子寫入
    } else {
      for (const it of items) if (it && it.id) mem[key][it.id] = it;
    }
  }
  return getShared();
}

/** 從某集合刪除一筆（跨裝置刪除用）。 */
export async function deleteSharedItem(key: SharedKey, id: string): Promise<void> {
  const redis = getRedis();
  if (redis) await redis.hdel(hashKey(key), id);
  else delete mem[key][id];
}

export async function clearShared(): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.del(...SHARED_KEYS.map((k) => hashKey(k)));
  } else {
    for (const key of SHARED_KEYS) mem[key] = {};
  }
}

/** 級聯刪除某使用者的所有共享資料（帳號真刪除時用）。 */
export async function deleteUserData(userId: string): Promise<void> {
  const all = await getShared();
  const f = (col: SharedKey, pred: (it: Item) => boolean) =>
    Promise.all(all[col].filter(pred).map((it) => deleteSharedItem(col, it.id)));
  await f('requests', (r) => r.creatorId === userId);
  await f('responses', (r) => r.userId === userId || r.dispatcherId === userId);
  await f('invitations', (i) => i.fromUserId === userId || i.toUserId === userId);
  await f('updates', (u) => u.userId === userId || u.actorId === userId);
  await f('chatMessages', (m) => m.senderId === userId);
  await f('presence', (p) => p.id === userId);
  await f('photoOverrides', (p) => p.id === userId);
  await f('photoGalleries', (p) => p.id === userId);
  await f('registeredUsers', (u) => u.id === userId);
  await f('blocks', (b) => b.blockerId === userId || b.blockedId === userId);
  await f('escorts', (e) => e.managerId === userId || e.id === userId);
}
