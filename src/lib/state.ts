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
import type { User, OnlineStatus, Request, Response, Invitation, UpdateEvent, Follow, ChatMessage, DirectMessage, MeetRecord, MomentPost } from '@/lib/mock';
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
  directMessages: DirectMessage[];
  meetRecords: MeetRecord[];
  teaserMessages: TeaserMessage[];
  inboxUnread: boolean;      // true when a new accepted invite is waiting in inbox
  momentPosts: MomentPost[];
  likedPostIds: string[];
  secondaryUserId: string | null; // 第二登入身份（雙身份 demo 用）
  rosters: { id: string; girlIds: string[] }[]; // 各幹部的女伴名單（id = 幹部 userId）
  presence: { id: string; online: boolean; updatedAt: string }[]; // 幹部設定的小姐上/下班（跨裝置同步）
  actingFromManagerId: string | null; // 幹部以旗下小姐身份操作時，記錄原幹部 id
  photoOverrides: { id: string; avatarUrl: string }[]; // 幹部改的小姐照片（跨裝置同步）
  photoGalleries: { id: string; urls: string[] }[]; // 各小姐的相簿（多張，跨裝置同步；id = 使用者 id）
}

// CLEAN_START = true：收件匣相關資料（局/回應/邀請/通知/聊天）全空，
//   保留用戶清單、在線狀態、廣場貼文，供「從零驗證流程」使用。
// 改回 false 即還原原本豐富的 demo seed 資料。
const CLEAN_START = true;

function getSeedState(): AppState {
  return {
    currentUserId: 'u-017', // 預設以 VIP 用戶身份登入（demo 展示用）
    onlineUserIds: seedOnlineStatuses.map((s) => s.userId),
    users: seedUsers,
    onlineStatuses: seedOnlineStatuses,
    requests: CLEAN_START ? [] : seedRequests,
    responses: CLEAN_START ? [] : seedResponses,
    invitations: CLEAN_START ? [] : seedInvitations,
    updates: CLEAN_START ? [] : seedUpdates,
    follows: seedFollows,
    readUpdateIds: CLEAN_START ? [] : seedUpdates.filter((u) => u.read).map((u) => u.id),
    userBlocks: [],
    notificationsEnabled: true,
    showOnNearby: true,
    autoOfflineHours: 4,
    chatMessages: CLEAN_START ? [] : seedChatMessages,
    directMessages: [],
    meetRecords: [],
    teaserMessages: CLEAN_START ? [] : seedTeaserMessages,
    inboxUnread: false,
    momentPosts: seedMomentPosts,
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
  };
}

function loadState(): AppState {
  if (typeof window === 'undefined') return getSeedState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getSeedState();
    const parsed = JSON.parse(raw);
    let merged = { ...getSeedState(), ...parsed } as AppState;
    // 套用已儲存的 override（照片、上/下班）到 users/在線列表
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
const SHARED_KEYS = ['requests', 'responses', 'invitations', 'updates', 'chatMessages', 'presence', 'photoOverrides', 'photoGalleries'] as const;
type SharedKey = typeof SHARED_KEYS[number];

// 依 photoOverrides 重算 users 的頭貼（無 override 者還原成 seed 原圖）
function applyPhotoOverrides(next: AppState): AppState {
  const overrides = next.photoOverrides ?? [];
  const map = new Map(overrides.map((o) => [o.id, o.avatarUrl]));
  const users = next.users.map((u) => {
    const seed = seedUsers.find((su) => su.id === u.id);
    const override = map.get(u.id);
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

// 將變動的共享集合 POST 到 server（fire-and-forget）
function pushSharedPatch(patch: Partial<Record<SharedKey, unknown[]>>) {
  if (typeof window === 'undefined') return;
  if (Object.keys(patch).length === 0) return;
  isPushing = true;
  fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patch }),
  })
    .catch(() => {})
    .finally(() => { isPushing = false; });
}

// 以 id union 合併 server 與本機集合（server 版本優先，保留尚未同步的本機項目）
function unionById<T extends { id: string }>(local: T[], server: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of local) map.set(item.id, item);
  for (const item of server) if (item && item.id) map.set(item.id, item);
  return [...map.values()];
}

function applyServerShared(shared: Partial<Record<SharedKey, { id: string }[]>>) {
  if (!globalState) globalState = loadState();
  let changed = false;
  const next = { ...globalState } as AppState;
  for (const key of SHARED_KEYS) {
    const serverArr = shared[key];
    if (!serverArr) continue;
    const merged = unionById(
      (globalState[key] as unknown as { id: string }[]) ?? [],
      serverArr
    );
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

function startSync() {
  if (syncStarted || typeof window === 'undefined') return;
  syncStarted = true;
  // 啟動時：先把本機既有的共享資料推上 server（種子或既有 demo 資料），再拉回合併
  const s = getState();
  const initPatch: Partial<Record<SharedKey, unknown[]>> = {};
  for (const key of SHARED_KEYS) {
    const arr = s[key] as unknown[];
    if (arr && arr.length) initPatch[key] = arr;
  }
  if (Object.keys(initPatch).length) pushSharedPatch(initPatch);
  pollShared();
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

  const currentUser = state.users.find((u) => u.id === state.currentUserId) ?? state.users[0];

  const isOnline = state.onlineUserIds.includes(state.currentUserId);

  const currentOnlineStatus = state.onlineStatuses.find((s) => s.userId === state.currentUserId);

  const unreadCount = state.updates.filter(
    (u) => u.userId === state.currentUserId && !state.readUpdateIds.includes(u.id)
  ).length;

  const switchUser = useCallback((userId: string) => {
    setState((prev) => ({ ...prev, currentUserId: userId }));
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
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === prev.currentUserId ? { ...u, ...updates } : u
      ),
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

    setState((prev) => ({
      ...prev,
      requests: [newReq, ...prev.requests],
      updates: [...managerNotifs, ...prev.updates],
      users: prev.users.map((u) =>
        u.id === prev.currentUserId
          ? { ...u, monthlyRequestsLeft: Math.max(0, u.monthlyRequestsLeft - 1) }
          : u
      ),
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
        const chatExpiresAt = new Date(Date.now() + 8 * 3_600_000).toISOString();
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
                ? new Date(Date.now() + 8 * 3_600_000).toISOString()
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
  const acceptResponder = useCallback((responseId: string) => {
    setState((prev) => {
      const target = prev.responses.find((r) => r.id === responseId);
      if (!target || target.responseStatus !== 'interested') return prev;

      const req = prev.requests.find((r) => r.id === target.requestId);
      if (!req) return prev;

      // #5 派工無上限：不再以 peopleCount 擋接受、也不自動關閉需求

      const now = new Date().toISOString();
      const chatExpiresAt = new Date(Date.now() + 8 * 3_600_000).toISOString();

      // #7 幹部代談：若此加入是幹部派工，聊天對象為該幹部（1:1），否則為女伴本人
      const chatPartnerId = target.dispatcherId ?? target.userId;

      const newInvite: Invitation = {
        id: `i-accept-${Date.now()}`,
        requestId: target.requestId,
        fromUserId: chatPartnerId,     // 代談幹部（或女伴）
        toUserId: prev.currentUserId,  // creator（客戶）
        status: 'accepted',
        createdAt: now,
        respondedAt: now,
        chatExpiresAt,
        dispatcherId: target.dispatcherId,
      };

      // 通知聊天對象（幹部或女伴）聊天室已開啟
      const partnerNotif: UpdateEvent = {
        id: `ue-accept-${Date.now()}`,
        userId: chatPartnerId,
        actorId: prev.currentUserId,
        eventType: 'invite_accepted',
        refRequestId: target.requestId,
        createdAt: now,
        read: false,
      };

      const updatedResponses = prev.responses.map((r) =>
        r.id === responseId ? { ...r, responseStatus: 'joining' as const } : r
      );

      const creatorUser = prev.users.find((u) => u.id === prev.currentUserId);
      sendPushNotification(
        chatPartnerId,
        '客戶已同意入局！',
        `${creatorUser?.nickname ?? '某位客戶'} 已同意，聊天室已開啟`,
        '/inbox'
      );

      return {
        ...prev,
        responses: updatedResponses,
        invitations: [...prev.invitations, newInvite],
        updates: [partnerNotif, ...prev.updates],
        inboxUnread: true,
      };
    });
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

      // Decline the matching invitation too (if one existed from accept)
      const invitations = wasAccepted
        ? prev.invitations.map((i) =>
            i.requestId === target.requestId && i.fromUserId === target.userId && i.status === 'accepted'
              ? { ...i, status: 'declined' as const, respondedAt: new Date().toISOString() }
              : i
          )
        : prev.invitations;

      // Penalty only when rejecting an already-accepted joiner
      const users = wasAccepted
        ? prev.users.map((u) =>
            u.id === prev.currentUserId
              ? { ...u, monthlyRequestsLeft: Math.max(0, u.monthlyRequestsLeft - 1) }
              : u
          )
        : prev.users;

      return { ...prev, responses, requests, invitations, users };
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
    setState((prev) => ({
      ...prev,
      userBlocks: [...new Set([...prev.userBlocks, targetId])],
    }));
  }, []);

  const unblockUser = useCallback((targetId: string) => {
    setState((prev) => ({
      ...prev,
      userBlocks: prev.userBlocks.filter((id) => id !== targetId),
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

  const sendChatMessage = useCallback((threadId: string, text: string, overrideSenderId?: string) => {
    const senderId = overrideSenderId ?? getState().currentUserId;
    const newMsg: ChatMessage = {
      id: `cm-${Date.now()}`,
      threadId,
      senderId,
      text,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      chatMessages: [...prev.chatMessages, newMsg],
    }));

    // 推播給聊天室的「其他參與者」（排除送出者）
    const s = getState();
    let recipients: string[] = [];
    if (threadId.startsWith('g-')) {
      // 群組：發起人 + 所有 joining 的女伴
      const reqId = threadId.slice(2);
      const req = s.requests.find((r) => r.id === reqId);
      const joinerIds = s.responses
        .filter((r) => r.requestId === reqId && r.responseStatus === 'joining')
        .map((r) => r.userId);
      recipients = [...(req ? [req.creatorId] : []), ...joinerIds];
    } else {
      // 1:1：threadId 是兩個 user id 排序組成
      recipients = (threadId.match(/u-\d+/g) ?? []);
    }
    recipients = [...new Set(recipients)].filter((id) => id !== senderId);
    if (recipients.length) {
      const sender = s.users.find((u) => u.id === senderId);
      sendPushNotification(
        recipients,
        `${sender?.nickname ?? '對方'} 傳來訊息`,
        text.length > 40 ? text.slice(0, 40) + '…' : text,
        `/chat/${threadId}`
      );
    }
    return newMsg;
  }, []);

  const sendDirectMessage = useCallback(
    (toUserId: string, msg: Omit<DirectMessage, 'id' | 'createdAt' | 'read'>) => {
      const newDm: DirectMessage = {
        ...msg,
        id: `dm-${Date.now()}`,
        createdAt: new Date().toISOString(),
        read: false,
      };
      setState((prev) => ({
        ...prev,
        directMessages: [...prev.directMessages, newDm],
      }));
      return newDm;
    },
    []
  );

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
    reset,
    sendChatMessage,
    sendDirectMessage,
    confirmMeetup,
    confirmGroupAttendance,
    clearInboxUnread,
    likePost,
    setSecondaryUser,
    setRoster,
    setUserPresence,
    setPhotoOverride,
    resetPhotoOverride,
    addGalleryPhoto,
    removeGalleryPhoto,
    switchToRosterGirl,
    returnToManager,
    swapIdentities,
    secondaryUnreadCount,
  };
}
