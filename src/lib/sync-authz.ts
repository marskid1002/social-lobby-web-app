/**
 * B：/api/sync 物件層級寫入授權（純函式，供 route 與單元測試共用；無任何 I/O）。
 *
 * 核心原則（見 M1–M6 決策）：
 *  - incoming item 不能自行宣稱 ownership；既有物件一律以 server stored object 為權威，並「重建」允許欄位（凍結不可變欄位）。
 *  - 新 id 才用 create 規則（驗 incoming 身份欄位並重建允許欄位，不直接 return incoming 整筆）。
 *  - 未授權 / 不合法 transition 的 item 逐筆丟棄或保持 server existing；合法項照存（不整批失敗）。
 *  - 同批只能用「已獨立通過授權」的 item 建立後續關係。
 *  - managedGirlIds 僅來自 escorts（managerId===session 且 !removed）＋同批剛通過 create 的自建 escort；不含 seed roster。
 *  - request_posted 通知的收件人須為 server 權威幹部帳號（managerUserIds，route 由 auth-store 預讀傳入）。
 *
 * route 端負責批次預讀 server 集合＋幹部名單並建成 ServerIndex 傳入，本模組不碰 Redis。
 */
import type { SessionPayload } from './session';
import { buildChatAccessIndex, activeBlockPeers, canWriteChatMessage } from './chat-authz';
import { chatExpiresAtFrom } from './chat-lifetime';

type Item = Record<string, unknown>;

export interface ServerIndex {
  escorts: Map<string, Item>;
  requests: Map<string, Item>;
  responses: Map<string, Item>;
  invitations: Map<string, Item>;
  updateIds: Set<string>;
  blocks: Map<string, Item>;
  momentPosts: Map<string, Item>;
  plazaComments: Map<string, Item>;
  chatMessages: Map<string, Item>; // D：既有訊息 id（append-only 用）
  managerUserIds: Set<string>;
}

export function emptyIndex(): ServerIndex {
  return {
    escorts: new Map(), requests: new Map(), responses: new Map(), invitations: new Map(),
    updateIds: new Set(), blocks: new Map(), momentPosts: new Map(), plazaComments: new Map(),
    chatMessages: new Map(),
    managerUserIds: new Set(),
  };
}

const isObj = (v: unknown): v is Item => typeof v === 'object' && v !== null && !Array.isArray(v);
const s = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const asArr = (v: unknown): Item[] => (Array.isArray(v) ? (v.filter(isObj) as Item[]) : []);

const REQUEST_STATUSES = new Set(['open', 'closed']);
const REQUEST_TYPES = new Set(['after_party', 'drinking', 'fill_spot', 'last_minute', 'other']);
const UPDATE_EVENTTYPES = new Set(['request_posted', 'response_received', 'invite_received', 'invite_accepted']);

// response 狀態轉移矩陣（依 state.ts 實際流程；[from,to]）
const RESP_SELF: [string, string][] = [['interested', 'withdrawn'], ['withdrawn', 'interested']]; // 加入/撤回/重新加入
const RESP_DISPATCH: [string, string][] = [['withdrawn', 'interested'], ['declined', 'interested']]; // 重新派工
const RESP_CREATOR: [string, string][] = [['interested', 'joining'], ['interested', 'declined'], ['joining', 'declined']]; // 接受/婉拒/取消已接受
const trans = (pairs: [string, string][], from: string | undefined, to: string | undefined) => !!from && !!to && pairs.some(([a, b]) => a === from && b === to);

export function authorizeWrites(rawPatch: Record<string, unknown>, session: SessionPayload, idx: ServerIndex, now: number = Date.now()): Record<string, unknown> {
  const me = session.userId;
  const isManager = session.role === 'manager';
  const out: Record<string, unknown> = { ...rawPatch };
  const acceptedAt = new Date(now).toISOString();
  const acceptedChatExpiresAt = chatExpiresAtFrom(now);

  // ── 1) escorts：create 驗 incoming.managerId===me；update 以 server existing.managerId===me，凍結 id/managerId/createdAt ──
  if ('escorts' in out) {
    out.escorts = asArr(out.escorts).flatMap((e) => {
      const id = s(e.id); if (!id || !isManager) return [];
      const existing = idx.escorts.get(id);
      if (existing) {
        if (s(existing.managerId) !== me) return []; // 不得接管他人 escort（即使 incoming.managerId 改成自己）
        const merged: Item = { ...existing };
        if (typeof e.nickname === 'string') merged.nickname = e.nickname;
        if (typeof e.removed === 'boolean') merged.removed = e.removed;
        return [merged]; // id/managerId/createdAt 一律沿用 existing
      }
      if (s(e.managerId) !== me) return [];
      return [e]; // 新建
    });
  }

  // managedGirlIds：server 既有（managerId===me 且 !removed）＋同批剛通過授權的自建 escort
  const managed = new Set<string>();
  for (const [id, e] of idx.escorts) if (s(e.managerId) === me && e.removed !== true) managed.add(id);
  for (const e of asArr(out.escorts)) {
    const id = s(e.id); if (!id) continue;
    if (s(e.managerId) === me || s(idx.escorts.get(id)?.managerId) === me) { if (e.removed === true) managed.delete(id); else managed.add(id); }
  }

  // ── 2) presence / photoOverrides / photoGalleries：僅 manager 且 item.id ∈ managedGirlIds ──
  for (const k of ['presence', 'photoOverrides', 'photoGalleries'] as const) {
    if (k in out) out[k] = asArr(out[k]).filter((it) => { const id = s(it.id); return !!id && isManager && managed.has(id); });
  }

  // ── 3) requests：create creatorId===me；update 以 server existing.creatorId===me，
  // 凍結身份/時間/統計，只允許狀態與發局者可編輯的內容欄位。
  if ('requests' in out) {
    out.requests = asArr(out.requests).flatMap((r) => {
      const id = s(r.id); if (!id) return [];
      const existing = idx.requests.get(id);
      if (existing) {
        if (s(existing.creatorId) !== me) return [];
        const merged: Item = { ...existing };
        if (typeof r.status === 'string' && REQUEST_STATUSES.has(r.status)) merged.status = r.status;
        if (s(existing.status) === 'open') {
          if (typeof r.area === 'string' && r.area.trim().length > 0 && r.area.length <= 40) {
            merged.area = r.area.trim();
          }
          if (typeof r.requestType === 'string' && REQUEST_TYPES.has(r.requestType)) {
            merged.requestType = r.requestType;
          }
          if (typeof r.peopleCount === 'number' && Number.isInteger(r.peopleCount) && r.peopleCount >= 1 && r.peopleCount <= 20) {
            merged.peopleCount = r.peopleCount;
          }
          if (typeof r.note === 'string' && r.note.length <= 200) {
            merged.note = r.note;
          }
        }
        return [merged];
      }
      if (s(r.creatorId) !== me) return [];
      return [r];
    });
  }

  // 已授權 requests（server ∪ 同批）：供 responses/invitations/updates 關聯依據
  const reqExists = (rid: string | undefined) => !!rid && (idx.requests.has(rid) || asArr(out.requests).some((r) => s(r.id) === rid));
  const reqCreator = (rid: string | undefined): string | undefined => {
    if (!rid) return undefined;
    const ex = idx.requests.get(rid); if (ex) return s(ex.creatorId);
    const b = asArr(out.requests).find((r) => s(r.id) === rid); return b ? s(b.creatorId) : undefined;
  };

  // ── 4) responses ──
  if ('responses' in out) {
    out.responses = asArr(out.responses).flatMap((r) => {
      const id = s(r.id); if (!id) return [];
      const existing = idx.responses.get(id);
      if (existing) {
        const exUser = s(existing.userId), exDisp = s(existing.dispatcherId), exReq = s(existing.requestId);
        const isSelf = exUser === me;
        const isOwnDispatcher = !!exDisp && exDisp === me;
        const isCreator = reqCreator(exReq) === me;
        const canRedispatch = isManager && !!exUser && managed.has(exUser) && (!exDisp || exDisp === me);
        if (!(isSelf || isOwnDispatcher || isCreator || canRedispatch)) return []; // 無任何關係 → 丟棄
        const from = s(existing.responseStatus), to = s(r.responseStatus);
        const merged: Item = { ...existing }; // 凍結 id/requestId/userId
        if (isSelf && trans(RESP_SELF, from, to)) {
          merged.responseStatus = to;
          if (from === 'withdrawn' && to === 'interested' && typeof r.createdAt === 'string') merged.createdAt = r.createdAt; // 重新加入刷新
        } else if ((isOwnDispatcher || canRedispatch) && trans(RESP_DISPATCH, from, to)) {
          merged.responseStatus = to;
          if (typeof r.createdAt === 'string') merged.createdAt = r.createdAt; // 重新派工刷新
          if (canRedispatch) merged.dispatcherId = me;                          // 僅重新派工可指派為自己
        } else if (isCreator && trans(RESP_CREATOR, from, to)) {
          merged.responseStatus = to;
        }
        // 不符合任一角色的合法 transition → responseStatus 凍結為 existing（不保存 incoming status）
        return [merged];
      }
      // create（server 重建；responseStatus 一律強制 interested，不接受 incoming joining/declined/withdrawn）
      const reqId = s(r.requestId); if (!reqExists(reqId)) return [];
      const uid = s(r.userId), disp = s(r.dispatcherId);
      const ca = typeof r.createdAt === 'string' ? { createdAt: r.createdAt } : {};
      if (uid === me && !disp) {                                             // 本人加入（不得帶 dispatcher）
        const built: Item = { id, requestId: reqId, userId: me, responseStatus: 'interested', ...ca };
        if (typeof r.note === 'string') built.note = r.note;
        return [built];
      }
      if (isManager && disp === me && !!uid && managed.has(uid)) {           // 派工自己旗下 escort
        return [{ id, requestId: reqId, userId: uid, dispatcherId: me, responseStatus: 'interested', ...ca }];
      }
      return [];
    });
  }

  // effectiveResponses：server existing，再由「同批已授權」的 responses 依 id 覆蓋（供 invitation/update 關聯用最新狀態）
  const effResponses = new Map<string, Item>();
  for (const [rid, r] of idx.responses) effResponses.set(rid, r);
  for (const r of asArr(out.responses)) { const rid = s(r.id); if (rid) effResponses.set(rid, r); }
  const findResp = (pred: (r: Item) => boolean): Item | undefined => {
    for (const r of effResponses.values()) if (pred(r)) return r;
    return undefined;
  };

  // ── 5) invitations ──
  if ('invitations' in out) {
    out.invitations = asArr(out.invitations).flatMap((i) => {
      const id = s(i.id); if (!id) return [];
      const existing = idx.invitations.get(id);
      if (existing) {
        const from = s(existing.fromUserId), to = s(existing.toUserId), reqId = existing.requestId;
        const isTo = to === me, isFrom = from === me;
        if (!isTo && !isFrom) return [];
        const merged: Item = { ...existing }; // 凍結 id/from/to/requestId/dispatcherId/createdAt/message
        const cur = s(existing.status) ?? 'pending';
        const inS = s(i.status);
        // toUserId 前向：pending→accepted/declined、accepted→declined
        if (isTo && inS && cur !== inS && ((cur === 'pending' && (inS === 'accepted' || inS === 'declined')) || (cur === 'accepted' && inS === 'declined'))) {
          merged.status = inS;
          merged.respondedAt = acceptedAt;
          if (inS === 'accepted') merged.chatExpiresAt = acceptedChatExpiresAt;
        }
        // 私人邀請 auto-accept 窄化例外（N 殘留）：requestId===null 且 fromUserId===me，只允許 pending→accepted
        if (isFrom && reqId == null && cur === 'pending' && inS === 'accepted') {
          merged.status = 'accepted';
          merged.respondedAt = acceptedAt;
          merged.chatExpiresAt = acceptedChatExpiresAt;
        }
        // confirmMeetup：任一參與者 false/undefined→true（單向）
        if ((isTo || isFrom) && i.meetupConfirmed === true && existing.meetupConfirmed !== true) merged.meetupConfirmed = true;
        return [merged];
      }
      // create（一律以 server/session 重建允許欄位，不 return incoming 整筆）
      const from = s(i.fromUserId), to = s(i.toUserId), reqId = i.requestId;
      if (from === me) {
        // sendInvite（一般/私人）：status 強制 pending；不得帶 respondedAt/chatExpiresAt/meetupConfirmed/dispatcherId
        const isPrivate = reqId == null;
        if (!isPrivate) { if (!reqExists(s(reqId))) return []; } // 一般邀請 request 必須存在
        const built: Item = { id, fromUserId: me, toUserId: to, requestId: isPrivate ? null : s(reqId), status: 'pending' };
        if (typeof i.message === 'string') built.message = i.message;
        if (typeof i.createdAt === 'string') built.createdAt = i.createdAt;
        return to ? [built] : [];
      }
      if (to === me) {
        // acceptResponder：creator 接受 response → accepted 邀請；嚴格交叉驗證，避免偽造「有人接受了你」
        const rid = s(reqId);
        if (!rid || reqCreator(rid) !== me || !from) return [];
        const mr = findResp((r) => s(r.requestId) === rid && (s(r.userId) === from || s(r.dispatcherId) === from));
        if (!mr) return [];
        const expectedFrom = s(mr.dispatcherId) ?? s(mr.userId);
        if (from !== expectedFrom) return [];                                   // fromUserId 必等於 dispatcherId ?? userId
        if (s(mr.dispatcherId) !== s(i.dispatcherId)) return [];                // dispatcherId 必與 response 精確一致（無則不得偽造）
        if (s(mr.responseStatus) !== 'joining') return [];                     // effective response 必須「已被接受(joining)」；同批 interested→joining＋建 invitation 仍可成功
        const built: Item = { id, fromUserId: from, toUserId: me, requestId: rid, status: 'accepted' };
        if (s(mr.dispatcherId)) built.dispatcherId = s(mr.dispatcherId);
        built.respondedAt = acceptedAt;
        built.chatExpiresAt = acceptedChatExpiresAt;
        if (typeof i.createdAt === 'string') built.createdAt = i.createdAt;
        return [built];
      }
      return [];
    });
  }

  // effectiveInvitations：server existing，再由「同批已授權」的 invitations 依 id 覆蓋（供 update 用最新狀態）
  const effInvites = new Map<string, Item>();
  for (const [iid, inv] of idx.invitations) effInvites.set(iid, inv);
  for (const inv of asArr(out.invitations)) { const iid = s(inv.id); if (iid) effInvites.set(iid, inv); }
  const findInvite = (pred: (inv: Item) => boolean): Item | undefined => {
    for (const inv of effInvites.values()) if (pred(inv)) return inv;
    return undefined;
  };

  // ── 6) updates：既有 append-only（丟棄覆寫）；新建限白名單 eventType 且依 eventType 驗 actor+recipient 關聯 ──
  if ('updates' in out) {
    out.updates = asArr(out.updates).flatMap((u) => {
      const id = s(u.id); if (!id) return [];
      if (idx.updateIds.has(id)) return [];                        // append-only：既有不得覆寫
      const evt = s(u.eventType); if (!evt || !UPDATE_EVENTTYPES.has(evt)) return [];
      const actor = s(u.actorId), rcpt = s(u.userId), refReq = s(u.refRequestId);
      if (evt === 'request_posted') {
        // 發局廣播給幹部：actor 為發局者本人、refRequestId 對應之局 creator===actor、收件人為 server 權威幹部
        return (actor === me && reqExists(refReq) && reqCreator(refReq) === actor && !!rcpt && idx.managerUserIds.has(rcpt)) ? [u] : [];
      }
      if (evt === 'response_received') {
        if (!reqExists(refReq) || reqCreator(refReq) !== rcpt) return []; // 收件人必為該局 creator
        // 本人加入：必須真的有一筆 effective response（requestId===refReq 且 userId===actor）
        if (actor === me && findResp((r) => s(r.requestId) === refReq && s(r.userId) === actor)) return [u];
        // 派工 delegation：actor 為本人旗下 escort，且有對應派工 response（userId===actor 且 dispatcherId===me）
        if (isManager && actor && managed.has(actor) && findResp((r) => s(r.requestId) === refReq && s(r.userId) === actor && s(r.dispatcherId) === me)) return [u];
        return [];
      }
      if (evt === 'invite_received') {
        // 寄件者通知收件人：actor===me、對應 effective 邀請 from===actor & to===rcpt 且 status===pending
        return (actor === me && !!rcpt && findInvite((inv) => s(inv.fromUserId) === actor && s(inv.toUserId) === rcpt && (s(inv.status) ?? 'pending') === 'pending')) ? [u] : [];
      }
      if (evt === 'invite_accepted') {
        // acceptResponder(actor=creator=me, rcpt=partner) 與 private auto-accept(actor=invitee, rcpt=sender=me)
        // 皆對應一筆 from===rcpt & to===actor 且「已 accepted」的 effective 邀請；且本人須為其中一方
        if (!(actor === me || rcpt === me)) return [];
        return (!!actor && !!rcpt && findInvite((inv) => s(inv.fromUserId) === rcpt && s(inv.toUserId) === actor && s(inv.status) === 'accepted')) ? [u] : [];
      }
      return [];
    });
  }

  // ── 7) M6：blocks/momentPosts/plazaComments — existing 以 server 重建（凍結身份），create 驗 owner===me ──
  if ('blocks' in out) {
    out.blocks = asArr(out.blocks).flatMap((b) => {
      const id = s(b.id); if (!id) return [];
      const ex = idx.blocks.get(id);
      if (ex) {
        if (s(ex.blockerId) !== me) return [];
        const merged: Item = { ...ex };                            // 凍結 id/blockerId/blockedId/createdAt
        if (typeof b.active === 'boolean') merged.active = b.active; // 只允許 active
        return [merged];
      }
      return s(b.blockerId) === me ? [b] : [];
    });
  }
  if ('momentPosts' in out) {
    out.momentPosts = asArr(out.momentPosts).flatMap((p) => {
      const id = s(p.id); if (!id) return [];
      const ex = idx.momentPosts.get(id);
      if (ex) {
        if (s(ex.authorId) !== me) return [];
        const merged: Item = { ...ex };                            // 凍結 id/authorId/content/imageUrl/createdAt
        if (typeof p.likeCount === 'number') merged.likeCount = p.likeCount;
        if (typeof p.commentCount === 'number') merged.commentCount = p.commentCount;
        return [merged];
      }
      return s(p.authorId) === me ? [p] : [];
    });
  }
  if ('plazaComments' in out) {
    out.plazaComments = asArr(out.plazaComments).flatMap((c) => {
      const id = s(c.id); if (!id) return [];
      const ex = idx.plazaComments.get(id);
      if (ex) return s(ex.userId) === me ? [ex] : [];              // 無編輯流程 → append-only：既有沿用 server 版
      return s(c.userId) === me ? [c] : [];
    });
  }
  // registeredUsers：owner 即 id，只能寫自己（economic/role/tier 由 route.sanitizePatch 另處理）
  if ('registeredUsers' in out) out.registeredUsers = asArr(out.registeredUsers).filter((u) => s(u.id) === me);

  // ── D：chatMessages — 成員授權 + 封鎖 + 過期 + append-only ──
  // 成員以「同批 effective 關係」（server ∪ 本批已通過 B 授權）為權威：
  //   effInvites/effResponses 已於上方建好；requests 取 server ∪ 本批已授權。
  // 既有 message id 一律凍結為 server 版（append-only：不得改 senderId/threadId/text/createdAt/imageUrl）。
  if ('chatMessages' in out) {
    const access = buildChatAccessIndex(
      me,
      {
        invitations: [...effInvites.values()],
        responses: [...effResponses.values()],
        requests: [...idx.requests.values(), ...asArr(out.requests)],
      },
      { writable: true, now },
    );
    const effBlocks = new Map(idx.blocks);
    for (const b of asArr(out.blocks)) { const id = s(b.id); if (id) effBlocks.set(id, b); }
    const blockedPeers = activeBlockPeers(me, [...effBlocks.values()]);
    out.chatMessages = asArr(out.chatMessages).flatMap((m) => {
      const id = s(m.id); if (!id) return [];
      const existing = idx.chatMessages.get(id);
      if (existing) return [existing];                              // append-only：既有沿用 server 版（凍結內容/身份/thread）
      return canWriteChatMessage(m, me, access, blockedPeers) ? [m] : [];
    });
  }

  return out;
}

/** route 端由已預讀的集合陣列＋幹部名單建 ServerIndex（只建授權需要用到的 by-id maps）。 */
export function buildIndex(cols: Record<string, Item[]>, managerUserIds: string[] = []): ServerIndex {
  const idx = emptyIndex();
  const fill = (m: Map<string, Item>, arr?: Item[]) => { for (const it of arr ?? []) { const id = s(it.id); if (id) m.set(id, it); } };
  fill(idx.escorts, cols.escorts);
  fill(idx.requests, cols.requests);
  fill(idx.responses, cols.responses);
  fill(idx.invitations, cols.invitations);
  fill(idx.blocks, cols.blocks);
  fill(idx.momentPosts, cols.momentPosts);
  fill(idx.plazaComments, cols.plazaComments);
  fill(idx.chatMessages, cols.chatMessages);
  for (const it of cols.updates ?? []) { const id = s(it.id); if (id) idx.updateIds.add(id); }
  for (const uid of managerUserIds) idx.managerUserIds.add(uid);
  return idx;
}
