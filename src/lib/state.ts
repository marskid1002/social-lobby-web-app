'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  users as seedUsers,
  onlineStatuses as seedOnlineStatuses,
  requests as seedRequests,
  responses as seedResponses,
  invitations as seedInvitations,
  updates as seedUpdates,
  follows as seedFollows,
  seedChatMessages,
  seedTeaserMessages,
  momentPosts as seedMomentPosts,
} from '@/lib/mock';
import type { User, OnlineStatus, Request, Response, Invitation, UpdateEvent, Follow, ChatMessage, MeetRecord, MomentPost, PlazaComment } from '@/lib/mock';
import type { TeaserMessage } from '@/lib/mock/chat';
import { sendPushNotification } from '@/lib/notify';

const STORAGE_KEY = 'sl_state_v3';
const PRIVATE_INVITE_CREDIT_COST = 3;
const EXTRA_SLOT_CREDIT_COST = 35;

export const TIER_MONTHLY_LIMITS: Record<string, number> = {
  guest: 0,
  free: 3,
  standard: 5,
  premium: 10,
  vip: 999,
};

export const TIER_SLOT_CAPS: Record<string, number> = {
  guest: 0,
  free: 1,
  standard: 3,
  premium: 5,
  vip: 999,
};

export interface AppState {
  currentUserId: string;
  onlineUserIds: string[];
  users: User[];
  onlineStatuses: OnlineStatus[];
  requests: Request[];
  responses: Response[];
  invitations: Invitation[];
  updates: UpdateEvent[];
  follows: Follow[];
  readUpdateIds: string[];
  userBlocks: string[];
  notificationsEnabled: boolean;
  showOnNearby: boolean;
  autoOfflineHours: number;
  chatMessages: ChatMessage[];
  meetRecords: MeetRecord[];
  teaserMessages: TeaserMessage[];
  inboxUnread: boolean;      // true when a new accepted invite is waiting in inbox
  momentPosts: MomentPost[];
  plazaComments: PlazaComment[];
  likedPostIds: string[];
  secondaryUserId: string | null; // 第二登入身份（雙身份 demo 用）
  rosters: { id: string; girlIds: string[] }[]; // 各幹部的女伴名單（id = 幹部 userId）
  presence: { id: string; online: boolean; updatedAt: string }[]; // 幹部設定的小姐上/下班（跨裝置同步）
  actingFromManagerId: string | null; // 幹部以旗下小姐身份操作時，記錄原幹部 id
  photoOverrides: { id: string; avatarUrl: string }[]; // 幹部改的小姐照片（跨裝置同步）
  photoGalleries: { id: string; urls: string[] }[]; // 各小姐的相簿（多張，跨裝置同步；id = 使用者 id）
  registeredUsers: User[]; // 手機+密碼註冊的新客戶（跨裝置同步）
  blocks: { id: string; blockerId: string; blockedId: string; active: boolean; createdAt: string }[]; // 雙向封鎖（跨裝置同步；id = `${blockerId}__${blockedId}`）
  escorts: { id: string; managerId: string; nickname: string; createdAt: string; removed?: boolean }[]; // 幹部自建的小姐（B：跨裝置同步；merge 進 users 顯示）
}

// CLEAN_START = true：收件匣相關資料（局/回應/邀請/通知/聊天）全空，
//   保留用戶清單、在線狀態、廣場貼文，供「從零驗證流程」使用。
// 改回 false 即還原原本豐富的 demo seed 資料。
const CLEAN_START = true;

// 幹部自建小姐的預設頭像（上傳前顯示中性佔位，不用真人臉）
const ESCORT_PLACEHOLDER = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20100%20100'%3E%3Crect%20width='100'%20height='100'%20fill='%23E5E7EB'/%3E%3Ccircle%20cx='50'%20cy='40'%20r='16'%20fill='%239CA3AF'/%3E%3Cpath%20d='M22%2084c0-16%2012-26%2028-26s28%2010%2028%2026'%20fill='%239CA3AF'/%3E%3C/svg%3E";

function getSeedState(): AppState {
  return {
    currentUserId: 'u-017', // 預設以 VIP 用戶身份登入（demo 展示用）
    // CLEAN_START：在線狀態改由 presence（幹部上/下班）驅動，起始為空，避免正式站顯示假的在線小姐
    onlineUserIds: CLEAN_START ? [] : seedOnlineStatuses.map((s) => s.userId),
    users: seedUsers,
    onlineStatuses: CLEAN_START ? [] : seedOnlineStatuses,
    requests: CLEAN_START ? [] : seedRequests,
    responses: CLEAN_START ? [] : seedResponses,
    invitations: CLEAN_START ? [] : seedInvitations,
    updates: CLEAN_START ? [] : seedUpdates,
    follows: CLEAN_START ? [] : seedFollows,
    readUpdateIds: CLEAN_START ? [] : seedUpdates.filter((u) => u.read).map((u) => u.id),
    userBlocks: [],
    notificationsEnabled: true,
    showOnNearby: true,
    autoOfflineHours: 4,
    chatMessages: CLEAN_START ? [] : seedChatMessages,
    meetRecords: [],
    teaserMessages: CLEAN_START ? [] : seedTeaserMessages,
    inboxUnread: false,
    momentPosts: CLEAN_START ? [] : seedMomentPosts, // 正式站不放假貼文
    plazaComments: [],
    likedPostIds: [],
    secondaryUserId: null,
    // 各幹部預設女伴名單（屬設定，不受 CLEAN_START 清除影響）
    rosters: [
      { id: 'u-018', girlIds: ['u-002', 'u-005', 'u-009', 'u-015'] },
      { id: 'u-023', girlIds: ['u-003', 'u-006', 'u-011'] },
      { id: 'u-024', girlIds: ['u-004', 'u-007'] },
      { id: 'u-025', girlIds: ['u-008', 'u-012'] },
      { id: 'u-026', girlIds: ['u-013', 'u-014'] },
      { id: 'u-027', girlIds: ['u-002', 'u-003'] },
      { id: 'u-028', girlIds: ['u-005', 'u-006'] },
      { id: 'u-029', girlIds: ['u-009', 'u-011'] },
      { id: 'u-030', girlIds: ['u-004', 'u-015'] },
      { id: 'u-031', girlIds: ['u-007', 'u-008'] },
    ],
    presence: [],
    actingFromManagerId: null,
    photoOverrides: [],
    photoGalleries: [],
    registeredUsers: [],
    blocks: [],
    escorts: [],
  };
}

function loadState(): AppState {
  if (typeof window === 'undefined') return getSeedState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getSeedState();
    const parsed = JSON.parse(raw);
    let merged = { ...getSeedState(), ...parsed } as AppState;
    // 套用已儲存的註冊用戶與 override（照片、上/下班）
    if (merged.registeredUsers?.length) merged = applyRegisteredUsers(merged);
    if (merged.photoOverrides?.length) merged = applyPhotoOverrides(merged);
    if (merged.presence?.length) merged = reconcilePresence(merged);
    return merged;
  } catch {
    return getSeedState();
  }
}

function saveState(state: AppState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function resetState() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('sl_onboarded');
}

let globalState: AppState | null = null;
const listeners = new Set<() => void>();

// ── 跨裝置同步 ──────────────────────────────────────────────────────────────
// 這些集合存在 server（/api/sync），跨裝置共享；其餘欄位（currentUserId、
// secondaryUserId、readUpdateIds、UI 偏好）維持各裝置本機。
// presence：小姐上/下班 override；photoOverrides：幹部改的照片 override；皆跨裝置同步（id = 使用者 id）
const SHARED_KEYS = ['requests', 'responses', 'invitations', 'updates', 'chatMessages', 'presence', 'photoOverrides', 'photoGalleries', 'registeredUsers', 'blocks', 'escorts', 'momentPosts', 'plazaComments'] as const;
type SharedKey = typeof SHARED_KEYS[number];

// 把註冊的新客戶併入 users（跨裝置：其他人才看得到發局者等資訊）
function applyRegisteredUsers(next: AppState): AppState {
  const regs = next.registeredUsers ?? [];
  if (!regs.length) return next;
  const regMap = new Map(regs.map((r) => [r.id, r]));
  // server 上的註冊用戶為權威（暱稱/等級/角色/頭像等），但「點數/發局額度」屬本機經濟狀態，
  // 不可被註冊當下的快照每次輪詢還原（#9）→ 既有 user 保留本機 credits/monthlyRequestsLeft。
  const users = next.users.map((u) => {
    const reg = regMap.get(u.id);
    if (!reg) return u;
    // 排除 server 快照的經濟欄位，保留本機 credits/monthlyRequestsLeft（#9）
    const { credits: _c, monthlyRequestsLeft: _m, ...regRest } = reg;
    return { ...u, ...regRest };
  });
  const existingIds = new Set(users.map((u) => u.id));
  // 新加入（其他裝置註冊的）用戶：經濟欄位依 tier 帶合理預設（server 快照已剝除經濟欄位），
  // 避免該客戶日後在此裝置登入時額度顯示 0、發局被誤擋（收斂總檢 #3）
  const toAdd = regs
    .filter((r) => !existingIds.has(r.id))
    .map((r) => ({ ...r, credits: r.credits ?? 100, monthlyRequestsLeft: r.monthlyRequestsLeft ?? (TIER_MONTHLY_LIMITS[r.tier] ?? 5) }));
  return { ...next, users: [...users, ...toAdd] };
}

// 把幹部自建的小姐（escorts）併入 users 供顯示/派工/聊天；removed 的則從 users 移除
function applyEscorts(next: AppState): AppState {
  const escorts = next.escorts ?? [];
  if (!escorts.length) return next;
  const users = [...next.users];
  for (const e of escorts) {
    const idx = users.findIndex((u) => u.id === e.id);
    if (e.removed) {
      if (idx >= 0) users.splice(idx, 1);
      continue;
    }
    if (idx >= 0) {
      users[idx] = { ...users[idx], nickname: e.nickname, role: 'escort', managerId: e.managerId };
    } else {
      users.push({
        id: e.id, lineUserId: e.id, nickname: e.nickname,
        avatarUrl: ESCORT_PLACEHOLDER, cardImageUrl: ESCORT_PLACEHOLDER,
        bio: '', defaultArea: '信義區', interests: [],
        tier: 'standard', role: 'escort', credits: 0, monthlyRequestsLeft: 0,
        lineOAFollowed: false, createdAt: e.createdAt, managerId: e.managerId,
      });
    }
  }
  return { ...next, users };
}

// 依 photoOverrides 重算 users 的頭貼（無 override 者還原成 seed 原圖）
function applyPhotoOverrides(next: AppState): AppState {
  const overrides = next.photoOverrides ?? [];
  const map = new Map(overrides.map((o) => [o.id, o.avatarUrl]));
  const users = next.users.map((u) => {
    const seed = seedUsers.find((su) => su.id === u.id);
    const raw = map.get(u.id);
    // 空字串視為「無覆寫」：還原照片時（尤其幹部自建、無 seed 原圖的小姐）不要讓 avatarUrl 變成 '' → <img src=""> 全白
    const override = raw && raw.length > 0 ? raw : undefined;
    const avatarUrl = override ?? seed?.avatarUrl ?? u.avatarUrl;
    const cardImageUrl = override ?? seed?.cardImageUrl ?? u.cardImageUrl;
    if (avatarUrl === u.avatarUrl && cardImageUrl === u.cardImageUrl) return u;
    return { ...u, avatarUrl, cardImageUrl };
  });
  return { ...next, users };
}

// 依 presence override 重算 onlineUserIds / onlineStatuses（有 override 者以 override 為準）
function reconcilePresence(next: AppState): AppState {
  const presence = next.presence ?? [];
  if (!presence.length) return next;
  let onlineUserIds = [...next.onlineUserIds];
  let onlineStatuses = [...next.onlineStatuses];
  for (const p of presence) {
    if (p.online) {
      if (!onlineUserIds.includes(p.id)) onlineUserIds.push(p.id);
      if (!onlineStatuses.some((s) => s.userId === p.id)) {
        const u = next.users.find((x) => x.id === p.id);
        onlineStatuses.push({
          userId: p.id,
          status: 'available',
          area: u?.defaultArea ?? '信義區',
          lastSeen: p.updatedAt,
          expiresAt: new Date(Date.now() + 8 * 3_600_000).toISOString(),
        });
      }
    } else {
      onlineUserIds = onlineUserIds.filter((id) => id !== p.id);
      onlineStatuses = onlineStatuses.filter((s) => s.userId !== p.id); // 下班 → 從在線列表移除
    }
  }
  return { ...next, onlineUserIds, onlineStatuses };
}
const SYNC_POLL_MS = 4000;
let syncStarted = false;
let isPushing = false;

// 尚未確認送達 server 的本機項目（避免 poll 以 server 舊版覆蓋樂觀更新造成靜默遺失，#10）
const unconfirmed: Partial<Record<SharedKey, Map<string, { id: string }>>> = {};

// 各共享集合的「清除時間戳」（來自 /api/sync 的 resetAt）。用來丟棄早於此時間的本機殘留，
// 讓管理員「清空」真正生效——否則 unionById 會保留本機、initPatch 會回推，導致已清資料復活。
let resetMarks: Record<string, number> = {};
function droppedBeforeReset(key: SharedKey, arr: { id: string }[]): { id: string }[] {
  const cutoff = resetMarks[key];
  if (!cutoff) return arr;
  // 只對「有 createdAt 的集合」套用清除時間戳；presence/photoOverrides/photoGalleries 等無 createdAt
  // 的集合不受影響（否則會被當成時間 0 而永久無法同步）。
  return arr.filter((x) => {
    const c = (x as { createdAt?: string }).createdAt;
    return !c || new Date(c).getTime() > cutoff;
  });
}

function trackUnconfirmed(patch: Partial<Record<SharedKey, unknown[]>>, add: boolean) {
  for (const key of Object.keys(patch) as SharedKey[]) {
    const arr = patch[key];
    if (!arr || !arr.length) continue;
    const m = unconfirmed[key] ?? (unconfirmed[key] = new Map());
    for (const it of arr as { id: string }[]) {
      if (!it || !it.id) continue;
      if (add) m.set(it.id, it); else m.delete(it.id);
    }
  }
}

// 同步錯誤對外通報（供 UI 顯示，避免靜默失敗；診斷用）
type SyncErrorListener = (msg: string) => void;
const syncErrorListeners = new Set<SyncErrorListener>();
export function onSyncError(cb: SyncErrorListener): () => void {
  syncErrorListeners.add(cb);
  return () => { syncErrorListeners.delete(cb); };
}
function emitSyncError(msg: string): void {
  if (typeof window !== 'undefined') syncErrorListeners.forEach((l) => l(msg));
}

// 將變動的共享集合 POST 到 server；失敗自動重試（最多 3 次），未確認前以本機為準（防靜默遺失，#10）
function pushSharedPatch(patch: Partial<Record<SharedKey, unknown[]>>, attempt = 0) {
  if (typeof window === 'undefined') return;
  if (Object.keys(patch).length === 0) return;
  if (attempt === 0) {
    // 只推送本人擁有的項目：blocks 限本人建立、registeredUsers 限本人，
    // 避免把 poll 併入的他人資料送回導致伺服器整批 403（收斂總檢 #1/#2）
    const me = getState().currentUserId;
    if (Array.isArray(patch.blocks)) patch.blocks = (patch.blocks as { blockerId?: string }[]).filter((b) => b.blockerId === me);
    if (Array.isArray(patch.registeredUsers)) patch.registeredUsers = (patch.registeredUsers as { id?: string }[]).filter((u) => u.id === me);
    if (Array.isArray(patch.escorts)) patch.escorts = (patch.escorts as { managerId?: string }[]).filter((e) => e.managerId === me);
    if (Array.isArray(patch.momentPosts)) patch.momentPosts = (patch.momentPosts as { authorId?: string }[]).filter((p) => p.authorId === me);
    if (Array.isArray(patch.plazaComments)) patch.plazaComments = (patch.plazaComments as { userId?: string }[]).filter((c) => c.userId === me);
    // 丟掉含 data: 內嵌圖片的項目（Blob 上傳失敗殘留的 dataURL）；否則整批會被伺服器擋，
    // 連帶 presence/escorts/requests… 全部同步失敗（一顆老鼠屎壞一鍋粥）。
    for (const k of Object.keys(patch) as SharedKey[]) {
      const arr = patch[k];
      if (Array.isArray(arr)) {
        const cleaned = arr.filter((it) => {
          try { return !JSON.stringify(it).includes('data:image'); } catch { return true; }
        });
        if (cleaned.length !== arr.length) patch[k] = cleaned;
      }
    }
    // 丟掉早於「清除時間戳」的項目，避免把管理員已清除的舊資料回推復活
    // （只對有 createdAt 的集合套用；無 createdAt 的集合如 presence/photo 不受影響）
    for (const k of Object.keys(patch) as SharedKey[]) {
      const arr = patch[k];
      const cutoff = resetMarks[k];
      if (Array.isArray(arr) && cutoff) {
        patch[k] = (arr as { createdAt?: string }[]).filter(
          (it) => !it.createdAt || new Date(it.createdAt).getTime() > cutoff
        ) as unknown[];
      }
    }
    trackUnconfirmed(patch, true);
  }
  // 過濾後若已無任何項目可送，直接結束（避免空推）
  if (!Object.values(patch).some((v) => Array.isArray(v) && (v as unknown[]).length)) return;
  const keys = Object.keys(patch).join(',');
  isPushing = true;
  fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patch }),
  })
    .then(async (res) => {
      if (res.ok) { trackUnconfirmed(patch, false); return; } // 確認送達 → 解除本機保護
      // 4xx（如 400 圖片格式不符 / 403 權限）重試也不會過 → 直接對外通報，不再靜默
      let detail = String(res.status);
      try { const j = await res.json(); if (j?.error) detail += ` ${j.error}`; } catch {}
      if (res.status >= 400 && res.status < 500) { emitSyncError(`同步被拒(${detail})·${keys}`); return; }
      throw new Error(`sync ${res.status}`);
    })
    .catch(() => {
      if (attempt < 3) setTimeout(() => pushSharedPatch(patch, attempt + 1), 1000 * (attempt + 1));
      else emitSyncError(`同步失敗(連線問題)·${keys}`); // 超過重試上限：仍保留於 unconfirmed，後續輪詢不會用 server 舊版覆蓋
    })
    .finally(() => { isPushing = false; });
}

// 以 id union 合併 server 與本機集合（server 版本優先，保留尚未同步的本機項目）
function unionById<T extends { id: string }>(local: T[], server: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of local) map.set(item.id, item);
  for (const item of server) if (item && item.id) map.set(item.id, item);
  return [...map.values()];
}

// 由 1:1 threadId（sort([a,b]).join('-')）與已知一方，取出另一方 id。
// 客戶 id 為 c-<uuid>（含連字號），不能用正則/切割硬拆 → 以已知一方做邊界比對。
// 我方相關的封鎖對象 id（雙向、只算 active 中），供前端隱藏 seed 名單用
export function blockedPeerIds(state: AppState): Set<string> {
  const me = state.currentUserId;
  const set = new Set<string>();
  for (const b of state.blocks ?? []) {
    if (!b.active) continue;
    if (b.blockerId === me) set.add(b.blockedId);
    if (b.blockedId === me) set.add(b.blockerId);
  }
  return set;
}

// 幹部自建的小姐 id 集合（只含 escorts 集合裡、未移除的）。
// 客戶大廳/附近/關注只顯示這些「真實小姐」，過濾掉 demo 種子的假人物（role user/escort）。
export function escortPeerIds(state: AppState): Set<string> {
  return new Set((state.escorts ?? []).filter((e) => !e.removed).map((e) => e.id));
}

export function otherIdFromThread(threadId: string, me: string): string {
  if (!me || !threadId) return '';
  if (threadId.startsWith(me + '-')) return threadId.slice(me.length + 1);
  if (threadId.endsWith('-' + me)) return threadId.slice(0, threadId.length - me.length - 1);
  // me 不是這個 thread 的參與者（例如幹部切成小姐身份、開一個客戶↔幹部的代談串）→ 不亂猜，回空，
  // 避免舊的 /u-\d+/ fallback 誤把「幹部自己」當成對話對象、造成聊天鎖死/對象顯示錯。
  return '';
}

function applyServerShared(shared: Partial<Record<SharedKey, { id: string }[]>>) {
  if (!globalState) globalState = loadState();
  // 更新清除時間戳（管理員清空後，server 會回帶各集合的清除時間）
  const incomingReset = (shared as { resetAt?: Record<string, number> }).resetAt;
  if (incomingReset) resetMarks = { ...resetMarks, ...incomingReset };
  let changed = false;
  const next = { ...globalState } as AppState;
  for (const key of SHARED_KEYS) {
    const serverArr = shared[key];
    if (!serverArr) continue;
    // 丟棄早於「清除時間戳」的本機殘留，避免 union 把已清資料保留下來
    const localArr = droppedBeforeReset(key, (globalState[key] as unknown as { id: string }[]) ?? []);
    let merged = unionById(localArr, serverArr);
    // 疊回尚未確認送達 server 的本機項目：server 版本不得覆蓋（#10）；但別把清除前的舊項目塞回
    const uc = unconfirmed[key];
    if (uc && uc.size) {
      const cutoff = resetMarks[key];
      const map = new Map(merged.map((x) => [x.id, x]));
      for (const [id, item] of uc) {
        const c = (item as { createdAt?: string }).createdAt;
        if (cutoff && c && new Date(c).getTime() <= cutoff) { uc.delete(id); continue; }
        map.set(id, item);
      }
      merged = [...map.values()];
    }
    // 排序：通知/局新到舊，聊天訊息舊到新
    const ts = (x: { id: string }) => new Date((x as unknown as { createdAt: string }).createdAt).getTime();
    if (key === 'updates' || key === 'requests') {
      merged.sort((a, b) => ts(b) - ts(a));
    } else if (key === 'chatMessages') {
      merged.sort((a, b) => ts(a) - ts(b));
    }
    (next[key] as unknown) = merged;
    changed = true;
  }
  if (changed) {
    let result = shared.presence ? reconcilePresence(next) : next;
    if (shared.registeredUsers) result = applyRegisteredUsers(result);
    if (shared.escorts) result = applyEscorts(result);
    if (shared.photoOverrides) result = applyPhotoOverrides(result);
    globalState = result;
    saveState(globalState);
    listeners.forEach((l) => l());
  }
}

async function pollShared() {
  try {
    const res = await fetch('/api/sync', { cache: 'no-store' });
    if (!res.ok) return;
    const shared = await res.json();
    applyServerShared(shared);
  } catch {}
}

/** 由通知落地頁主動刷新一次權威共享資料。 */
export async function refreshShared(): Promise<void> {
  await pollShared();
}

function startSync() {
  if (syncStarted || typeof window === 'undefined') return;
  syncStarted = true;
  // 啟動時：先拉一次（取得 resetAt 並丟棄已被清除的本機殘留），再把「剩餘」本機共享資料推上 server，
  // 避免把管理員已清除的舊資料又回推復活。
  pollShared().then(() => {
    const s = getState();
    const initPatch: Partial<Record<SharedKey, unknown[]>> = {};
    for (const key of SHARED_KEYS) {
      const arr = s[key] as unknown[];
      if (arr && arr.length) initPatch[key] = arr;
    }
    if (Object.keys(initPatch).length) pushSharedPatch(initPatch);
  });
  setInterval(pollShared, SYNC_POLL_MS);
}

// 重設共享資料（同時清 server）
export function resetSharedState() {
  if (typeof window === 'undefined') return;
  fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reset: true }),
  }).catch(() => {});
}

function getState(): AppState {
  if (!globalState) {
    globalState = loadState();
  }
  return globalState;
}

function setState(updater: (prev: AppState) => AppState) {
  const prev = getState();
  const next = updater(prev);
  globalState = next;
  saveState(next);
  // 偵測變動的共享集合並推送到 server
  if (typeof window !== 'undefined') {
    const patch: Partial<Record<SharedKey, unknown[]>> = {};
    for (const key of SHARED_KEYS) {
      if (next[key] !== prev[key]) patch[key] = next[key] as unknown[];
    }
    pushSharedPatch(patch);
  }
  listeners.forEach((l) => l());
}

export function useAppState() {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    listeners.add(listener);
    startSync(); // 啟動跨裝置同步（單例，內部自我防重）
    return () => { listeners.delete(listener); };
  }, []);

  const state = getState();

  // 找不到對應 user 時，不要 fallback 成 users[0]（會冒用別人身份、洩漏別人資料）；
  // 改回一個以目前 id 為基礎的中性占位物件（永不冒用他人），僅在完全沒有 currentUserId 時才用 users[0]。
  const currentUser = state.users.find((u) => u.id === state.currentUserId)
    ?? (state.currentUserId
      ? ({
          id: state.currentUserId, lineUserId: state.currentUserId, nickname: '',
          avatarUrl: '', cardImageUrl: '', bio: '', defaultArea: '信義區', interests: [],
          tier: 'standard', role: 'user', credits: 0, monthlyRequestsLeft: 0,
          lineOAFollowed: false, createdAt: '2024-01-01T00:00:00.000Z',
        } as User)
      : state.users[0]);

  const isOnline = state.onlineUserIds.includes(state.currentUserId);

  const currentOnlineStatus = state.onlineStatuses.find((s) => s.userId === state.currentUserId);

  const unreadCount = state.updates.filter(
    (u) => u.userId === state.currentUserId && !state.readUpdateIds.includes(u.id)
  ).length;

  const switchUser = useCallback((userId: string) => {
    setState((prev) => ({ ...prev, currentUserId: userId }));
  }, []);

  // 手機+密碼註冊成功後：建立客戶 user 物件、加入同步的 registeredUsers、設為目前身份
  const registerCustomer = useCallback((userId: string, nickname: string) => {
    setState((prev) => {
      const already = prev.registeredUsers.some((u) => u.id === userId);
      const newUser: User = {
        id: userId,
        lineUserId: userId,
        nickname,
        avatarUrl: 'https://randomuser.me/api/portraits/lego/5.jpg',
        cardImageUrl: 'https://randomuser.me/api/portraits/lego/5.jpg',
        bio: '',
        defaultArea: '信義區',
        interests: [],
        tier: 'standard', // 註冊客戶預設 standard（與 server createCustomer 一致）
        role: 'user',
        credits: 100,
        monthlyRequestsLeft: 5,
        lineOAFollowed: false,
        createdAt: new Date().toISOString(),
      };
      const registeredUsers = already ? prev.registeredUsers : [...prev.registeredUsers, newUser];
      const users = prev.users.some((u) => u.id === userId) ? prev.users : [...prev.users, newUser];
      return { ...prev, registeredUsers, users, currentUserId: userId };
    });
  }, []);

  // 已註冊客戶登入：設為目前身份（user 物件由同步的 registeredUsers 帶入）
  const loginCustomer = useCallback((userId: string, nickname: string) => {
    setState((prev) => {
      // 若本機還沒有這個 user（尚未同步到），先補一個基本物件，稍後 poll 會覆蓋
      const hasUser = prev.users.some((u) => u.id === userId);
      const users = hasUser
        ? prev.users.map((u) => {
            // 修復被 poll 以 0 併入的舊客戶額度（credits 與額度同為 0 = 未初始化簽名），避免發局被誤擋
            if (u.id !== userId) return u;
            if ((u.monthlyRequestsLeft ?? 0) === 0 && (u.credits ?? 0) === 0) {
              return { ...u, credits: 100, monthlyRequestsLeft: TIER_MONTHLY_LIMITS[u.tier] ?? 5 };
            }
            return u;
          })
        : [...prev.users, {
            id: userId, lineUserId: userId, nickname,
            avatarUrl: 'https://randomuser.me/api/portraits/lego/5.jpg',
            cardImageUrl: 'https://randomuser.me/api/portraits/lego/5.jpg',
            bio: '', defaultArea: '信義區', interests: [],
            tier: 'standard' as const, role: 'user' as const, credits: 100,
            monthlyRequestsLeft: 5, lineOAFollowed: false,
            createdAt: new Date().toISOString(),
          } as User];
      return { ...prev, users, currentUserId: userId };
    });
  }, []);

  const setOnline = useCallback((online: boolean) => {
    setState((prev) => {
      const onlineUserIds = online
        ? [...new Set([...prev.onlineUserIds, prev.currentUserId])]
        : prev.onlineUserIds.filter((id) => id !== prev.currentUserId);

      let onlineStatuses = prev.onlineStatuses;
      if (online && !prev.onlineStatuses.find((s) => s.userId === prev.currentUserId)) {
        const user = prev.users.find((u) => u.id === prev.currentUserId);
        onlineStatuses = [
          ...prev.onlineStatuses,
          {
            userId: prev.currentUserId,
            status: 'available',
            area: user?.defaultArea ?? '信義區',
            lastSeen: new Date().toISOString(),
            expiresAt: new Date(Date.now() + prev.autoOfflineHours * 3_600_000).toISOString(),
          },
        ];
      } else if (!online) {
        onlineStatuses = prev.onlineStatuses.filter((s) => s.userId !== prev.currentUserId);
      }

      return { ...prev, onlineUserIds, onlineStatuses };
    });
  }, []);

  const setStatus = useCallback((status: OnlineStatus['status']) => {
    setState((prev) => ({
      ...prev,
      onlineStatuses: prev.onlineStatuses.map((s) =>
        s.userId === prev.currentUserId ? { ...s, status } : s
      ),
    }));
  }, []);

  const setArea = useCallback((area: string) => {
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === prev.currentUserId ? { ...u, defaultArea: area } : u
      ),
      onlineStatuses: prev.onlineStatuses.map((s) =>
        s.userId === prev.currentUserId ? { ...s, area } : s
      ),
    }));
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setState((prev) => {
      const users = prev.users.map((u) =>
        u.id === prev.currentUserId ? { ...u, ...updates } : u
      );
      // 將本人資料 upsert 進 registeredUsers（唯一跨裝置同步、且客戶端會套用的集合），
      // 讓暱稱/地區/簡介等 profile 編輯能同步並顯示給其他人（含幹部改名）。
      const me = users.find((u) => u.id === prev.currentUserId);
      const registeredUsers = !me
        ? prev.registeredUsers
        : prev.registeredUsers.some((u) => u.id === me.id)
          ? prev.registeredUsers.map((u) => (u.id === me.id ? { ...u, ...me } : u))
          : [...prev.registeredUsers, me];
      return { ...prev, users, registeredUsers };
    });
  }, []);

  // 幹部自建小姐（B）：新增（名字必填，照片事後用「照片」按鈕上傳）、移除（軟刪除同步）
  const addEscort = useCallback((nickname: string) => {
    const name = nickname.trim();
    if (!name) return;
    const me = getState().currentUserId;
    const now = new Date().toISOString();
    // 前綴用 esc-（不可用 g-：會與群組聊天室 threadId 慣例 g-<requestId> 撞名，害 1:1 聊天訊息被誤判過濾）
    const id = `esc-${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    setState((prev) => {
      const newUser: User = {
        id, lineUserId: id, nickname: name,
        avatarUrl: ESCORT_PLACEHOLDER, cardImageUrl: ESCORT_PLACEHOLDER,
        bio: '', defaultArea: '信義區', interests: [],
        tier: 'standard', role: 'escort', credits: 0, monthlyRequestsLeft: 0,
        lineOAFollowed: false, createdAt: now, managerId: me,
      };
      return {
        ...prev,
        escorts: [...prev.escorts, { id, managerId: me, nickname: name, createdAt: now }],
        users: [...prev.users, newUser],
      };
    });
  }, []);

  const removeEscort = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      escorts: prev.escorts.map((e) => (e.id === id ? { ...e, removed: true } : e)),
      users: prev.users.filter((u) => u.id !== id),
    }));
  }, []);

  const postRequest = useCallback((req: Omit<Request, 'id' | 'creatorId' | 'createdAt' | 'expiresAt' | 'status' | 'metrics'>) => {
    const newReq: Request = {
      ...req,
      id: `r-${Date.now()}`,
      creatorId: getState().currentUserId,
      status: 'open',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
      metrics: { impressions: 0, views: 0, joins: 0 },
    };
    // 通知幹部：有新的局可安排出席（排除發局者本人，避免自己發自己收）
    const posterId = getState().currentUserId;
    const managerIds = getState().users
      .filter((u) => u.role === 'manager' && u.id !== posterId)
      .map((u) => u.id);
    const now = new Date().toISOString();
    const managerNotifs: UpdateEvent[] = managerIds.map((mid, idx) => ({
      id: `ue-newreq-${Date.now()}-${idx}`,
      userId: mid,
      actorId: posterId,
      eventType: 'request_posted',
      refRequestId: newReq.id,
      createdAt: now,
      read: false,
    }));

    // 發局不佔額度（暫不收費）：發局不再扣 monthlyRequestsLeft
    setState((prev) => ({
      ...prev,
      requests: [newReq, ...prev.requests],
      updates: [...managerNotifs, ...prev.updates],
    }));

    // 推播給幹部（背景通知）
    const poster = getState().users.find((u) => u.id === posterId);
    sendPushNotification(
      managerIds,
      '有新的局邀請',
      `${poster?.nickname ?? '某位用戶'} 發布了新的局，快安排出席`,
      '/lobby/explore'
    );

    return newReq;
  }, []);

  const respondToRequest = useCallback((requestId: string, note?: string) => {
    const newResponse: Response = {
      id: `rr-${Date.now()}`,
      requestId,
      userId: getState().currentUserId,
      responseStatus: 'interested',
      note,
      createdAt: new Date().toISOString(),
    };
    const req = getState().requests.find((r) => r.id === requestId);
    const newUpdate: UpdateEvent = {
      id: `ue-${Date.now()}`,
      userId: req?.creatorId ?? '',
      actorId: getState().currentUserId,
      eventType: 'response_received',
      refRequestId: requestId,
      createdAt: new Date().toISOString(),
      read: false,
    };
    setState((prev) => ({
      ...prev,
      responses: [...prev.responses, newResponse],
      updates: [newUpdate, ...prev.updates],
    }));
  }, []);

  // sendInvite: private invites (requestId=null) cost 3 credits and auto-accept after 1.5s
  const sendInvite = useCallback((toUserId: string, requestId: string | null, message?: string) => {
    const isPrivate = requestId === null;
    const inviteId = `i-${Date.now()}`;
    const newInvite: Invitation = {
      id: inviteId,
      requestId,
      fromUserId: getState().currentUserId,
      toUserId,
      status: 'pending',
      message,
      createdAt: new Date().toISOString(),
    };
    const newUpdate: UpdateEvent = {
      id: `ue-${Date.now()}`,
      userId: toUserId,
      actorId: getState().currentUserId,
      eventType: 'invite_received',
      refRequestId: requestId ?? undefined,
      createdAt: new Date().toISOString(),
      read: false,
    };

    setState((prev) => ({
      ...prev,
      invitations: [...prev.invitations, newInvite],
      updates: [newUpdate, ...prev.updates],
      // Deduct 3 credits for private invites
      users: isPrivate
        ? prev.users.map((u) =>
            u.id === prev.currentUserId ? { ...u, credits: Math.max(0, u.credits - PRIVATE_INVITE_CREDIT_COST) } : u
          )
        : prev.users,
    }));

    // 推播通知給收件方
    const senderUser = getState().users.find((u) => u.id === getState().currentUserId);
    sendPushNotification(
      toUserId,
      '你收到一則邀請',
      `${senderUser?.nickname ?? '某人'} 傳送了${isPrivate ? '私人邀請' : '邀請'}`,
      '/inbox'
    );

    // Auto-accept private invites after 1.5s
    if (isPrivate) {
      setTimeout(() => {
        const senderId = getState().currentUserId;
        const chatExpiresAt = new Date(Date.now() + 30 * 24 * 3_600_000).toISOString(); // 聊天視窗 30 天（demo：避免跨天測試就過期鎖住）
        const acceptedUpdate: UpdateEvent = {
          id: `ue-${Date.now()}`,
          userId: senderId,
          actorId: toUserId,
          eventType: 'invite_accepted',
          createdAt: new Date().toISOString(),
          read: false,
        };
        setState((prev) => ({
          ...prev,
          invitations: prev.invitations.map((inv) =>
            inv.id === inviteId
              ? { ...inv, status: 'accepted', respondedAt: new Date().toISOString(), chatExpiresAt }
              : inv
          ),
          updates: [acceptedUpdate, ...prev.updates],
          inboxUnread: true,
        }));
      }, 1500);
    }
  }, []);

  const respondToInvite = useCallback((inviteId: string, accept: boolean) => {
    setState((prev) => ({
      ...prev,
      invitations: prev.invitations.map((i) =>
        i.id === inviteId
          ? {
              ...i,
              status: accept ? 'accepted' : 'declined',
              respondedAt: new Date().toISOString(),
              chatExpiresAt: accept
                ? new Date(Date.now() + 30 * 24 * 3_600_000).toISOString()
                : undefined,
            }
          : i
      ),
    }));
  }, []);

  // Only allowed when no active joiners. UI must enforce this guard before calling.
  const closeRequest = useCallback((requestId: string) => {
    setState((prev) => {
      const activeJoiners = prev.responses.filter(
        (r) => r.requestId === requestId && r.responseStatus === 'joining'
      ).length;
      if (activeJoiners > 0) return prev; // blocked — must reject all joiners first
      return {
        ...prev,
        requests: prev.requests.map((r) =>
          r.id === requestId ? { ...r, status: 'closed' } : r
        ),
      };
    });
  }, []);

  // Escort withdraws their 'interested' request before the creator accepts.
  const cancelJoinRequest = useCallback((requestId: string) => {
    setState((prev) => ({
      ...prev,
      responses: prev.responses.map((r) =>
        r.requestId === requestId && r.userId === prev.currentUserId && r.responseStatus === 'interested'
          ? { ...r, responseStatus: 'withdrawn' as const }
          : r
      ),
    }));
  }, []);

  // Escort asks to join: creates an 'interested' response + notifies creator. No invitation yet.
  const joinRequest = useCallback((requestId: string) => {
    const s = getState();
    const request = s.requests.find((r) => r.id === requestId);
    if (!request) return;
    const escortId = s.currentUserId;

    // Guard: don't double-respond (allow re-join after withdrawal by reactivating)
    const existing = s.responses.find(
      (r) => r.requestId === requestId && r.userId === escortId
    );
    if (existing?.responseStatus === 'interested' || existing?.responseStatus === 'joining') return;
    // Reactivate a withdrawn response instead of creating a duplicate
    if (existing?.responseStatus === 'withdrawn') {
      const notif: UpdateEvent = {
        id: `ue-ask-${Date.now()}`,
        userId: request.creatorId,
        actorId: escortId,
        eventType: 'response_received',
        refRequestId: requestId,
        createdAt: new Date().toISOString(),
        read: false,
      };
      setState((prev) => ({
        ...prev,
        responses: prev.responses.map((r) =>
          r.id === existing.id ? { ...r, responseStatus: 'interested' as const, createdAt: new Date().toISOString() } : r
        ),
        updates: [notif, ...prev.updates],
      }));
      return;
    }

    const now = new Date().toISOString();
    const newResp: import('@/lib/mock').Response = {
      id: `rr-ask-${Date.now()}`,
      requestId,
      userId: escortId,
      responseStatus: 'interested',
      createdAt: now,
    };
    const notif: UpdateEvent = {
      id: `ue-ask-${Date.now()}`,
      userId: request.creatorId,
      actorId: escortId,
      eventType: 'response_received',
      refRequestId: requestId,
      createdAt: now,
      read: false,
    };
    setState((prev) => ({
      ...prev,
      responses: [...prev.responses, newResp],
      updates: [notif, ...prev.updates],
    }));

    const joiner = getState().users.find((u) => u.id === escortId);
    sendPushNotification(
      request.creatorId,
      '有人想加入你的局',
      `${joiner?.nickname ?? '某人'} 對你的需求感興趣`,
      `/requests/${requestId}`
    );
  }, []);

  // 幹部派工：以指定女伴身分對某個局建立 'interested' 回應，並通知發起人。
  // 與 joinRequest 相同效果，但對象是 girlId 而非當前使用者（供幹部代為安排出席）。
  const dispatchGirl = useCallback((requestId: string, girlId: string) => {
    const s = getState();
    const request = s.requests.find((r) => r.id === requestId);
    if (!request) return;

    // 防止重複派工：若該女伴已 interested / joining 則略過
    const existing = s.responses.find(
      (r) => r.requestId === requestId && r.userId === girlId
    );
    if (existing?.responseStatus === 'interested' || existing?.responseStatus === 'joining') return;

    const now = new Date().toISOString();
    const notif: UpdateEvent = {
      id: `ue-dispatch-${Date.now()}`,
      userId: request.creatorId,
      actorId: girlId,
      eventType: 'response_received',
      refRequestId: requestId,
      createdAt: now,
      read: false,
    };

    const dispatcherId = s.currentUserId; // 派工的幹部（客戶接受後由此幹部代談）

    setState((prev) => {
      // 若是先前 withdrawn 的回應則重新啟用，否則新增一筆
      const responses = existing
        ? prev.responses.map((r) =>
            r.id === existing.id
              ? { ...r, responseStatus: 'interested' as const, createdAt: now, dispatcherId }
              : r
          )
        : [
            ...prev.responses,
            {
              id: `rr-dispatch-${Date.now()}`,
              requestId,
              userId: girlId,
              responseStatus: 'interested' as const,
              createdAt: now,
              dispatcherId,
            },
          ];
      return { ...prev, responses, updates: [notif, ...prev.updates] };
    });

    const girl = getState().users.find((u) => u.id === girlId);
    sendPushNotification(
      request.creatorId,
      '有人想加入你的局',
      `${girl?.nickname ?? '某位女伴'} 願意出席你的邀約`,
      `/requests/${requestId}`
    );
  }, []);

  // Creator accepts an 'interested' joiner: flips to 'joining', creates invitation + chat.
  // For requests with peopleCount > 1, uses a shared group thread (g-{requestId}).
  const acceptResponder = useCallback(async (responseId: string) => {
    const res = await fetch('/api/matches/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responseId }),
    });
    const body = await res.json().catch(() => ({})) as {
      error?: string;
      response?: Response;
      invitation?: Invitation;
      update?: UpdateEvent;
    };
    if (!res.ok || !body.response || !body.invitation) {
      throw new Error(body.error || '聊天室建立失敗，請稍後再試');
    }

    // server 已完成落盤後，才把權威結果套回客戶端；不再先產生本機假聊天室。
    applyServerShared({
      responses: [body.response],
      invitations: [body.invitation],
      ...(body.update ? { updates: [body.update] } : {}),
    });
    return body.invitation;
  }, []);

  // Record that an escort viewed this request detail (FOMO tracking).
  const recordRequestViewer = useCallback((requestId: string) => {
    const s = getState();
    const request = s.requests.find((r) => r.id === requestId);
    if (!request) return;
    if (request.creatorId === s.currentUserId) return;
    const viewerId = s.currentUserId;
    if (request.requestViewers?.includes(viewerId)) return;
    // Only record for escorts
    const viewer = s.users.find((u) => u.id === viewerId);
    if (viewer?.role !== 'escort') return;

    setState((prev) => ({
      ...prev,
      requests: prev.requests.map((r) =>
        r.id === requestId
          ? { ...r, requestViewers: [...(r.requestViewers ?? []), viewerId] }
          : r
      ),
    }));
  }, []);

  // Decline a joiner. Penalty (−1 slot) ONLY when rejecting an already-accepted ('joining') response.
  const declineResponder = useCallback((responseId: string) => {
    setState((prev) => {
      const target = prev.responses.find((r) => r.id === responseId);
      if (!target) return prev;
      const wasAccepted = target.responseStatus === 'joining';

      const responses = prev.responses.map((r) =>
        r.id === responseId ? { ...r, responseStatus: 'declined' as const } : r
      );

      // Reopen request if it was auto-closed by this joiner's slot
      const req = prev.requests.find((r) => r.id === target.requestId);
      const remainingJoiners = responses.filter(
        (r) => r.requestId === target.requestId && r.responseStatus === 'joining'
      ).length;
      const requests = (req && req.status === 'closed' && remainingJoiners < req.peopleCount)
        ? prev.requests.map((r) => r.id === req.id ? { ...r, status: 'open' as const } : r)
        : prev.requests;

      // Decline the matching invitation too (if one existed from accept)。
      // 代談派工時，acceptResponder 產生的 invitation.fromUserId = dispatcherId（幹部），
      // 故撤銷條件需比對 dispatcherId ?? userId，否則幹部聊天室/名額會殘留（#11）。
      const inviteFrom = target.dispatcherId ?? target.userId;
      const invitations = wasAccepted
        ? prev.invitations.map((i) =>
            i.requestId === target.requestId && i.fromUserId === inviteFrom && i.status === 'accepted'
              ? { ...i, status: 'declined' as const, respondedAt: new Date().toISOString() }
              : i
          )
        : prev.invitations;

      // 發局不佔額度（暫不收費）：拒絕已入局者不再扣次數
      return { ...prev, responses, requests, invitations };
    });
  }, []);

  // Spend 35 credits to buy 1 extra monthly request slot.
  const buyExtraSlot = useCallback(() => {
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === prev.currentUserId
          ? {
              ...u,
              credits: Math.max(0, u.credits - EXTRA_SLOT_CREDIT_COST),
              monthlyRequestsLeft: u.monthlyRequestsLeft + 1,
            }
          : u
      ),
    }));
  }, []);

  const toggleFollow = useCallback((targetId: string) => {
    setState((prev) => {
      const existing = prev.follows.find(
        (f) => f.followerId === prev.currentUserId && f.followingId === targetId
      );
      if (existing) {
        return { ...prev, follows: prev.follows.filter((f) => f.id !== existing.id) };
      }
      const newFollow: Follow = {
        id: `f-${Date.now()}`,
        followerId: prev.currentUserId,
        followingId: targetId,
        createdAt: new Date().toISOString(),
      };
      return { ...prev, follows: [...prev.follows, newFollow] };
    });
  }, []);

  const blockUser = useCallback((targetId: string) => {
    const me = getState().currentUserId;
    const id = `${me}__${targetId}`;
    const now = new Date().toISOString();
    setState((prev) => {
      const exists = prev.blocks.some((b) => b.id === id);
      const blocks = exists
        ? prev.blocks.map((b) => (b.id === id ? { ...b, active: true } : b))
        : [...prev.blocks, { id, blockerId: me, blockedId: targetId, active: true, createdAt: now }];
      return { ...prev, blocks, userBlocks: [...new Set([...prev.userBlocks, targetId])] };
    });
  }, []);

  const unblockUser = useCallback((targetId: string) => {
    const me = getState().currentUserId;
    const id = `${me}__${targetId}`;
    setState((prev) => ({
      ...prev,
      // 軟刪除（active:false）以配合 merge-only 同步；伺服器只認 active 的封鎖
      blocks: prev.blocks.map((b) => (b.id === id ? { ...b, active: false } : b)),
      userBlocks: prev.userBlocks.filter((x) => x !== targetId),
    }));
  }, []);

  const markUpdatesRead = useCallback((ids: string[]) => {
    setState((prev) => ({
      ...prev,
      readUpdateIds: [...new Set([...prev.readUpdateIds, ...ids])],
    }));
  }, []);

  const reset = useCallback(() => {
    globalState = getSeedState();
    saveState(globalState);
    localStorage.removeItem('sl_onboarded');
    localStorage.removeItem('sl_state_v2');
    resetSharedState(); // 同時清空 server 共享資料（跨裝置一起重設）
    listeners.forEach((l) => l());
  }, []);

  const sendChatMessage = useCallback(async (threadId: string, text: string, overrideSenderId?: string, imageUrl?: string, requestId?: string) => {
    // 正式流程不允許前端冒用 senderId；overrideSenderId 僅為舊 demo 介面保留，server 仍以 session 為準。
    if (overrideSenderId && overrideSenderId !== getState().currentUserId) {
      throw new Error('示範身分不可送出正式訊息');
    }
    const res = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, text, imageUrl, requestId }),
    });
    const body = await res.json().catch(() => ({})) as { error?: string; message?: ChatMessage };
    if (!res.ok || !body.message) {
      throw new Error(body.error || '訊息傳送失敗');
    }
    const newMsg = body.message;
    applyServerShared({ chatMessages: [newMsg] });
    return newMsg;
  }, []);


  // Confirm meetup: locks the chat and records the meet
  const confirmMeetup = useCallback((inviteId: string, otherUserId: string) => {
    setState((prev) => ({
      ...prev,
      invitations: prev.invitations.map((inv) =>
        inv.id === inviteId ? { ...inv, meetupConfirmed: true } : inv
      ),
      meetRecords: [
        ...prev.meetRecords.filter((r) => r.userId !== otherUserId),
        {
          userId: otherUserId,
          metAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        },
      ],
    }));
  }, []);

  // Group attendance: escort marks themselves as attended on a group request.
  // Case closes when all joiners have confirmed.
  const confirmGroupAttendance = useCallback((requestId: string) => {
    setState((prev) => {
      const escortId = prev.currentUserId;
      // Mark the escort's invitation as meetupConfirmed
      const updatedInvitations = prev.invitations.map((inv) =>
        inv.requestId === requestId && inv.fromUserId === escortId && inv.status === 'accepted'
          ? { ...inv, meetupConfirmed: true }
          : inv
      );
      // Record the meet with the creator
      const req = prev.requests.find((r) => r.id === requestId);
      const creatorId = req?.creatorId ?? '';
      const newMeetRecord = creatorId
        ? {
            userId: creatorId,
            metAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          }
        : null;
      // Check if all joiners have confirmed → auto-close the request
      const allJoinerInvites = updatedInvitations.filter(
        (inv) => inv.requestId === requestId && inv.status === 'accepted'
      );
      const allConfirmed = allJoinerInvites.length > 0 && allJoinerInvites.every((inv) => inv.meetupConfirmed);
      return {
        ...prev,
        invitations: updatedInvitations,
        requests: allConfirmed
          ? prev.requests.map((r) => r.id === requestId ? { ...r, status: 'closed' as const } : r)
          : prev.requests,
        meetRecords: newMeetRecord
          ? [...prev.meetRecords.filter((r) => r.userId !== creatorId), newMeetRecord]
          : prev.meetRecords,
      };
    });
  }, []);

  const clearInboxUnread = useCallback(() => {
    setState((prev) => ({ ...prev, inboxUnread: false }));
  }, []);

  const setSecondaryUser = useCallback((userId: string | null) => {
    setState((prev) => ({ ...prev, secondaryUserId: userId }));
  }, []);

  // 設定某幹部的女伴名單（本機設定，不跨裝置同步）
  const setRoster = useCallback((managerId: string, girlIds: string[]) => {
    setState((prev) => {
      const exists = prev.rosters.some((r) => r.id === managerId);
      const rosters = exists
        ? prev.rosters.map((r) => (r.id === managerId ? { ...r, girlIds } : r))
        : [...prev.rosters, { id: managerId, girlIds }];
      return { ...prev, rosters };
    });
  }, []);

  // 幹部設定某位小姐的上/下班狀態（跨裝置同步）
  const setUserPresence = useCallback((userId: string, online: boolean) => {
    setState((prev) => {
      const updatedAt = new Date().toISOString();
      const exists = prev.presence.some((p) => p.id === userId);
      const presence = exists
        ? prev.presence.map((p) => (p.id === userId ? { ...p, online, updatedAt } : p))
        : [...prev.presence, { id: userId, online, updatedAt }];
      return reconcilePresence({ ...prev, presence });
    });
  }, []);

  // 幹部設定某位小姐的照片（跨裝置同步）；avatarUrl 為新圖網址
  const setPhotoOverride = useCallback((userId: string, avatarUrl: string) => {
    setState((prev) => {
      const exists = prev.photoOverrides.some((o) => o.id === userId);
      const photoOverrides = exists
        ? prev.photoOverrides.map((o) => (o.id === userId ? { ...o, avatarUrl } : o))
        : [...prev.photoOverrides, { id: userId, avatarUrl }];
      return applyPhotoOverrides({ ...prev, photoOverrides });
    });
  }, []);

  // 刪除幹部改的照片 → 還原成原始 seed 頭貼（以 seed url 當 override 讓刪除也能跨裝置同步）
  const resetPhotoOverride = useCallback((userId: string) => {
    const seed = seedUsers.find((su) => su.id === userId);
    setPhotoOverride(userId, seed?.avatarUrl ?? '');
  }, [setPhotoOverride]);

  // 相簿：新增一張照片（跨裝置同步）
  const addGalleryPhoto = useCallback((userId: string, url: string) => {
    setState((prev) => {
      const exists = prev.photoGalleries.some((g) => g.id === userId);
      const photoGalleries = exists
        ? prev.photoGalleries.map((g) => (g.id === userId ? { ...g, urls: [...g.urls, url] } : g))
        : [...prev.photoGalleries, { id: userId, urls: [url] }];
      return { ...prev, photoGalleries };
    });
  }, []);

  // 相簿：刪除一張照片（跨裝置同步）
  const removeGalleryPhoto = useCallback((userId: string, url: string) => {
    setState((prev) => ({
      ...prev,
      photoGalleries: prev.photoGalleries.map((g) =>
        g.id === userId ? { ...g, urls: g.urls.filter((u) => u !== url) } : g
      ),
    }));
  }, []);

  // 幹部以旗下小姐身份操作（記錄原幹部，供返回）
  const switchToRosterGirl = useCallback((girlId: string) => {
    setState((prev) => ({
      ...prev,
      actingFromManagerId: prev.currentUserId,
      currentUserId: girlId,
    }));
  }, []);

  // 從小姐身份返回原幹部
  const returnToManager = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentUserId: prev.actingFromManagerId ?? prev.currentUserId,
      actingFromManagerId: null,
    }));
  }, []);

  // 取得第二身份的未讀通知數
  const secondaryUnreadCount = state.secondaryUserId
    ? state.updates.filter(
        (u) => u.userId === state.secondaryUserId && !state.readUpdateIds.includes(u.id)
      ).length
    : 0;

  // 互換主副身份
  const swapIdentities = useCallback(() => {
    setState((prev) => {
      if (!prev.secondaryUserId) return prev;
      return { ...prev, currentUserId: prev.secondaryUserId, secondaryUserId: prev.currentUserId };
    });
  }, []);

  const likePost = useCallback((postId: string) => {
    setState((prev) => {
      const alreadyLiked = prev.likedPostIds.includes(postId);
      return {
        ...prev,
        likedPostIds: alreadyLiked
          ? prev.likedPostIds.filter((id) => id !== postId)
          : [...prev.likedPostIds, postId],
        momentPosts: prev.momentPosts.map((p) =>
          p.id === postId
            ? { ...p, likeCount: p.likeCount + (alreadyLiked ? -1 : 1) }
            : p
        ),
      };
    });
  }, []);

  // 廣場發文（跨裝置同步）
  const createMomentPost = useCallback((content: string, imageUrl?: string) => {
    const text = content.trim();
    if (!text && !imageUrl) return undefined;
    const me = getState().currentUserId;
    const post: MomentPost = {
      id: `mp-${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      authorId: me,
      content: text,
      ...(imageUrl ? { imageUrl } : {}),
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({ ...prev, momentPosts: [post, ...prev.momentPosts] }));
    return post;
  }, []);

  // 廣場留言（跨裝置同步）；parentId 有值 = 回覆某則留言
  const addPlazaComment = useCallback((postId: string, text: string, parentId?: string) => {
    const t = text.trim();
    if (!t) return undefined;
    const me = getState().currentUserId;
    const comment: PlazaComment = {
      id: `pc-${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      postId,
      userId: me,
      text: t,
      ...(parentId ? { parentId } : {}),
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({ ...prev, plazaComments: [...prev.plazaComments, comment] }));
    return comment;
  }, []);

  return {
    state,
    currentUser,
    isOnline,
    currentOnlineStatus,
    unreadCount,
    switchUser,
    setOnline,
    setStatus,
    setArea,
    updateUser,
    postRequest,
    respondToRequest,
    sendInvite,
    respondToInvite,
    closeRequest,
    declineResponder,
    buyExtraSlot,
    joinRequest,
    dispatchGirl,
    acceptResponder,
    cancelJoinRequest,
    recordRequestViewer,
    toggleFollow,
    blockUser,
    unblockUser,
    markUpdatesRead,
    refreshShared,
    reset,
    sendChatMessage,
    confirmMeetup,
    confirmGroupAttendance,
    clearInboxUnread,
    likePost,
    createMomentPost,
    addPlazaComment,
    setSecondaryUser,
    setRoster,
    setUserPresence,
    setPhotoOverride,
    resetPhotoOverride,
    addGalleryPhoto,
    removeGalleryPhoto,
    addEscort,
    removeEscort,
    registerCustomer,
    loginCustomer,
    switchToRosterGirl,
    returnToManager,
    swapIdentities,
    secondaryUnreadCount,
  };
}
