/**
 * 跨裝置共享狀態儲存層（B 資料層：原子寫入版）。
 * 每個集合存成一個 Redis Hash（field = 項目 id，value = 項目 JSON），
 * 寫入用 HSET（逐項原子），避免「單一 key read-modify-write」的併發覆蓋（lost update）。
 * 本地開發（無 Redis）用記憶體 fallback。
 */

import { getRedis, kvKey, warnIfRedisMissingInProd } from './kv';
import { planDataRetention } from './data-retention';

warnIfRedisMissingInProd(); // 生產環境缺 Redis → 冷啟動時大聲警告（資料不會持久化）

const hashKey = (col: string) => kvKey(`sl:h:v1:${col}`); // 每集合一個 hash（含環境前綴）
const RESET_KEY = kvKey('sl:reset:v1'); // hash：{ collection: 清除時間戳(ms) }，供用戶端丟棄舊本機殘留

export type SharedKey =
  | 'requests' | 'responses' | 'invitations' | 'updates' | 'chatMessages'
  | 'chatReads'
  | 'presence' | 'photoOverrides' | 'photoGalleries' | 'registeredUsers' | 'blocks' | 'escorts'
  | 'momentPosts' | 'plazaComments';

export const SHARED_KEYS: SharedKey[] = [
  'requests', 'responses', 'invitations', 'updates', 'chatMessages',
  'chatReads',
  'presence', 'photoOverrides', 'photoGalleries', 'registeredUsers', 'blocks', 'escorts',
  'momentPosts', 'plazaComments',
];

type Item = { id: string; [k: string]: unknown };
export type SharedState = Record<SharedKey, Item[]>;

function emptyShared(): SharedState {
  return {
    requests: [], responses: [], invitations: [], updates: [], chatMessages: [],
    chatReads: [],
    presence: [], photoOverrides: [], photoGalleries: [], registeredUsers: [], blocks: [], escorts: [],
    momentPosts: [], plazaComments: [],
  };
}

// 記憶體 fallback：{ collection: { id: item } }
const mem: Record<SharedKey, Record<string, Item>> = {
  requests: {}, responses: {}, invitations: {}, updates: {}, chatMessages: {},
  chatReads: {},
  presence: {}, photoOverrides: {}, photoGalleries: {}, registeredUsers: {}, blocks: {}, escorts: {},
  momentPosts: {}, plazaComments: {},
};
const memReset: Record<string, number> = {}; // 記憶體 fallback 的清除時間戳

function parseItem(v: unknown): Item | null {
  if (v == null) return null;
  if (typeof v === 'object') return v as Item;
  try { return JSON.parse(String(v)) as Item; } catch { return null; }
}

async function readSharedRaw(): Promise<SharedState> {
  const redis = getRedis();
  const out = emptyShared();
  if (redis) {
    // 14 個集合「並行」讀取。原本是序列 for-await，等於 14 次往返：
    // 實測線上基準往返 0.35s、每次 hgetall 約 0.18s → /api/sync 要 2.9s。
    // 並行後約等於一次往返。語意不變（仍是一份快照），且並行取到的時間點更接近一致。
    const hashes = await Promise.all(
      SHARED_KEYS.map((key) => redis.hgetall(hashKey(key)) as Promise<Record<string, unknown> | null>),
    );
    SHARED_KEYS.forEach((key, i) => {
      const h = hashes[i];
      if (h) out[key] = Object.values(h).map(parseItem).filter(Boolean) as Item[];
    });
  } else {
    for (const key of SHARED_KEYS) out[key] = Object.values(mem[key]);
  }
  return out;
}

async function deleteSharedItems(remove: Partial<Record<SharedKey, string[]>>): Promise<void> {
  const redis = getRedis();
  for (const key of SHARED_KEYS) {
    const ids = remove[key];
    if (!ids?.length) continue;
    if (redis) await redis.hdel(hashKey(key), ...ids);
    else for (const id of ids) delete mem[key][id];
  }
}

/** Permanently remove an escort and records keyed directly by that escort id. */
export async function permanentlyDeleteEscort(escortId: string): Promise<void> {
  await deleteSharedItems({
    escorts: [escortId],
    presence: [escortId],
    photoOverrides: [escortId],
    photoGalleries: [escortId],
  });
}

export async function getShared(): Promise<SharedState> {
  const plan = planDataRetention(await readSharedRaw());
  await deleteSharedItems(plan.remove);
  return plan.state;
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

/**
 * 依 id 逐項 upsert（HSET 原子）。
 *
 * 只寫入、不回傳完整狀態：原本結尾會 `return getShared()`，導致每次寫入都把 14 個集合
 * 重讀一遍（約 2.5s）。實際上 11 個呼叫端裡只有 /api/sync 需要合併後的完整狀態，
 * 其餘（送出訊息、標記已讀、接受配對、確認約會結果…）都把回傳值丟棄卻付了那個成本。
 * 需要完整狀態的呼叫端請在之後自行 `await getShared()`。
 */
export async function mergeShared(patch: Partial<SharedState>): Promise<void> {
  const redis = getRedis();
  const writes: Promise<unknown>[] = [];
  for (const key of SHARED_KEYS) {
    const items = patch[key];
    if (!items || !items.length) continue;
    if (redis) {
      const obj: Record<string, Item> = {};
      for (const it of items) if (it && it.id) obj[it.id] = it;
      if (Object.keys(obj).length) writes.push(redis.hset(hashKey(key), obj)); // 逐 field 原子寫入
    } else {
      for (const it of items) if (it && it.id) mem[key][it.id] = it;
    }
  }
  if (writes.length) await Promise.all(writes); // 不同集合的寫入互不相依，可並行
}

export interface PhotoGalleryRecord extends Item {
  id: string;
  urls: string[];
}

const UPDATE_GALLERY_SCRIPT = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
local current = {}
if raw then
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and type(decoded) == 'table' and type(decoded.urls) == 'table' then
    current = decoded.urls
  end
end

local incoming = cjson.decode(ARGV[2])
local remove = cjson.decode(ARGV[3])
local removed = {}
for _, url in ipairs(remove) do removed[url] = true end

local seen = {}
local result = {}
for _, url in ipairs(current) do
  if type(url) == 'string' and not removed[url] and not seen[url] then
    seen[url] = true
    table.insert(result, url)
  end
end
for _, url in ipairs(incoming) do
  if type(url) == 'string' and not removed[url] and not seen[url] then
    seen[url] = true
    table.insert(result, url)
  end
end

local record = { id = ARGV[1], urls = result }
local encoded = cjson.encode(record)
redis.call('HSET', KEYS[1], ARGV[1], encoded)
return encoded
`;

/** Atomically append/remove gallery URLs so concurrent uploads cannot overwrite newer photos. */
export async function updatePhotoGallery(
  userId: string,
  changes: { append?: string[]; remove?: string[] },
): Promise<PhotoGalleryRecord> {
  const append = [...new Set(changes.append ?? [])];
  const remove = [...new Set(changes.remove ?? [])];
  const redis = getRedis();
  if (redis) {
    const raw = await redis.eval(
      UPDATE_GALLERY_SCRIPT,
      [hashKey('photoGalleries')],
      [userId, JSON.stringify(append), JSON.stringify(remove)],
    );
    const parsed = parseItem(raw);
    return {
      id: userId,
      urls: Array.isArray(parsed?.urls)
        ? parsed.urls.filter((url): url is string => typeof url === 'string')
        : [],
    };
  }

  const existing = mem.photoGalleries[userId];
  const removed = new Set(remove);
  const urls = [...new Set([
    ...(Array.isArray(existing?.urls) ? existing.urls.filter((url): url is string => typeof url === 'string') : []),
    ...append,
  ])].filter((url) => !removed.has(url));
  const record: PhotoGalleryRecord = { id: userId, urls };
  mem.photoGalleries[userId] = record;
  return record;
}

/** 從某集合刪除一筆（跨裝置刪除用）。 */
export async function deleteSharedItem(key: SharedKey, id: string): Promise<void> {
  const redis = getRedis();
  if (redis) await redis.hdel(hashKey(key), id);
  else delete mem[key][id];
}

// 清除共享資料；傳入 keys 只清指定集合（例如只清局/對話，保留小姐/照片/帳號），不傳則全清。
export async function clearShared(keys?: string[]): Promise<void> {
  const redis = getRedis();
  const targets = keys && keys.length ? SHARED_KEYS.filter((k) => keys.includes(k)) : SHARED_KEYS;
  if (!targets.length) return;
  // 記錄各集合的清除時間戳：用戶端會據此丟棄早於此時間的本機殘留，避免 union/回推把已清資料復活
  const now = Date.now();
  const marks: Record<string, number> = {};
  for (const k of targets) marks[k] = now;
  if (redis) {
    await redis.del(...targets.map((k) => hashKey(k)));
    await redis.hset(RESET_KEY, marks);
  } else {
    for (const key of targets) mem[key] = {};
    Object.assign(memReset, marks);
  }
}

// 取得各集合的「清除時間戳」。用戶端據此丟棄早於此時間的本機殘留（讓管理員清空能真正生效）。
export async function getResetMarks(): Promise<Record<string, number>> {
  const redis = getRedis();
  if (redis) {
    const h = (await redis.hgetall(RESET_KEY)) as Record<string, unknown> | null;
    if (!h) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(h)) out[k] = Number(v) || 0;
    return out;
  }
  return { ...memReset };
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
  await f('chatReads', (r) => r.userId === userId);
  await f('presence', (p) => p.id === userId);
  await f('photoOverrides', (p) => p.id === userId);
  await f('photoGalleries', (p) => p.id === userId);
  await f('registeredUsers', (u) => u.id === userId);
  await f('blocks', (b) => b.blockerId === userId || b.blockedId === userId);
  await f('escorts', (e) => e.managerId === userId || e.id === userId);
}
