/**
 * D：聊天室成員授權（純函式，無任何 I/O；供 /api/sync GET 讀取範圍、POST 寫入授權與單元測試共用）。
 *
 * 核心原則：
 *  - threadId 一律「不解析、不切割」。1:1/代談 threadId = sort([a,b]).join('-')，而 id 本身含連字號
 *    （u-001 / c-<uuid> / esc-...），切割會有歧義。改以「由 server 已儲存關係算出『我合法所屬的
 *    threadId 集合』」，再對 msg.threadId 做「精確等值」比對 → 杜絕 includes/startsWith 子字串碰撞
 *    （例如 u-01 不得誤匹配只屬於 u-010 的聊天室）。
 *  - 成員權威來源：invitation 的 {fromUserId,toUserId} 定義 1:1/代談；g-{requestId} 群組成員 =
 *    局 creator ∪ 該局 responseStatus==='joining' 的回應者。incoming patch 不得自行宣稱成員資格。
 *  - 寫入額外限制：對應 invitation 須 status==='accepted' 且未過 chatExpiresAt（過期禁新寫、歷史仍可讀）。
 *  - 封鎖只套用於「直接 1:1/代談」；群組不因個別成員互相封鎖而整團失效。
 */

type Rec = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** 1:1/代談 threadId 的正規形式：兩個 userId 排序後以 '-' 串接（與前端 inbox getThreadId 一致）。 */
export function canonicalThreadId(a: string, b: string): string {
  return [a, b].sort().join('-');
}

type DirectInvitationLike = {
  fromUserId?: unknown;
  toUserId?: unknown;
  chatThreadId?: unknown;
};

/** 新資料優先使用每筆派工的獨立 thread；舊資料維持雙方 canonical thread。 */
export function directInvitationThreadId(
  invitation: DirectInvitationLike | Record<string, unknown>,
): string {
  const explicit = str(invitation.chatThreadId);
  if (explicit) return explicit;
  const from = str(invitation.fromUserId);
  const to = str(invitation.toUserId);
  return from && to && from !== to ? canonicalThreadId(from, to) : '';
}

export interface ChatAccess {
  direct: Map<string, string>; // 1:1/代談 threadId -> 對方 userId（供封鎖判定）
  directRequestIds: Map<string, Set<string | null>>; // threadId -> 合法 invitation.requestId（私人邀請為 null）
  group: Set<string>;          // 群組 threadId（g-{requestId}）
}

export interface ChatAccessOpts {
  writable?: boolean; // true：套用寫入限制（對應 invitation 須 accepted 且未過期）
  now?: number;       // 目前時間（ms）；writable 時據此判斷 chatExpiresAt
}

const hasValidWritableExpiry = (exp: string | undefined, now: number): boolean => {
  if (!exp) return false;
  const t = Date.parse(exp);
  return Number.isFinite(t) && now < t;
};

/**
 * 算出 me 合法所屬的聊天室集合。
 * data 傳入「server 已儲存」（讀取端）或「server ∪ 同批已通過 B 授權」的 effective 關係（寫入端）。
 */
export function buildChatAccessIndex(
  me: string,
  data: { invitations?: Rec[]; responses?: Rec[]; requests?: Rec[] },
  opts: ChatAccessOpts = {},
): ChatAccess {
  const direct = new Map<string, string>();
  const directRequestIds = new Map<string, Set<string | null>>();
  const group = new Set<string>();
  if (!me) return { direct, directRequestIds, group };
  const now = opts.now ?? 0;

  // 1:1 / 代談：invitation 的 {from,to} 即該聊天室兩端成員
  for (const inv of data.invitations ?? []) {
    const from = str(inv.fromUserId), to = str(inv.toUserId);
    if (!from || !to || from === to) continue;
    if (from !== me && to !== me) continue;
    if (opts.writable) {
      if (str(inv.status) !== 'accepted') continue;             // 寫入須已接受
      if (inv.meetupConfirmed === true) continue;                // 已確認見面即關閉新寫入
      if (str(inv.managerDecision) === 'declined') continue;     // 幹部拒絕才結案；確認上台後仍可對話
      if (str(inv.meetupEndedAt)) continue;                      // 約會結束後保留紀錄但鎖住新訊息
      if (!hasValidWritableExpiry(str(inv.chatExpiresAt), now)) continue;
    }
    const threadId = directInvitationThreadId(inv);
    if (!threadId) continue;
    direct.set(threadId, from === me ? to : from);
    const requestIds = directRequestIds.get(threadId) ?? new Set<string | null>();
    requestIds.add(str(inv.requestId) ?? null);
    directRequestIds.set(threadId, requestIds);
  }

  // 群組：g-{requestId}，成員 = 局 creator ∪ 該局 joining 回應者
  const memberReqIds = new Set<string>();
  for (const req of data.requests ?? []) {
    if (str(req.creatorId) === me) { const id = str(req.id); if (id) memberReqIds.add(id); }
  }
  for (const r of data.responses ?? []) {
    if (str(r.userId) === me && str(r.responseStatus) === 'joining') {
      const rid = str(r.requestId); if (rid) memberReqIds.add(rid);
    }
  }
  for (const rid of memberReqIds) {
    if (opts.writable) {
      // 群組寫入：至少要有一筆尚未確認見面、期限合法且未過期的 accepted 群組 invitation。
      const gInvites = (data.invitations ?? []).filter(
        (i) => str(i.requestId) === rid && str(i.status) === 'accepted' && str(i.groupThreadId) === `g-${rid}`,
      );
      const hasActiveInvite = gInvites.some(
        (i) => i.meetupConfirmed !== true && hasValidWritableExpiry(str(i.chatExpiresAt), now),
      );
      // 舊群組資料可能沒有 groupThreadId；保留既有 request/response 成員判斷，
      // 但只要已有群組 invitation，就必須通過關閉狀態與期限檢查。
      if (gInvites.length > 0 && !hasActiveInvite) continue;
    }
    group.add(`g-${rid}`);
  }

  return { direct, directRequestIds, group };
}

/** me 與哪些人有 active 封鎖（雙向）。active !== false 視為生效（與 scopeForSession 一致，壞資料 fail-safe）。 */
export function activeBlockPeers(me: string, blocks: Rec[] | undefined): Set<string> {
  const set = new Set<string>();
  if (!me) return set;
  for (const b of blocks ?? []) {
    if (!b || (b as Rec).active === false) continue;
    const bl = str(b.blockerId), bd = str(b.blockedId);
    if (bl === me && bd) set.add(bd);
    if (bd === me && bl) set.add(bl);
  }
  return set;
}

/**
 * 單筆 chatMessage 是否可由 me 寫入（成員 + 封鎖 + 過期；不含 append-only，既有 id 由呼叫端另行凍結）。
 * access 須以 { writable:true } 建；blockedPeers 由 activeBlockPeers 建（server ∪ 同批 blocks）。
 */
export function canWriteChatMessage(
  msg: Rec,
  me: string,
  access: ChatAccess,
  blockedPeers: Set<string>,
): boolean {
  if (str(msg.senderId) !== me) return false;                 // senderId 必精確等於登入帳號
  const tid = str(msg.threadId);
  if (!tid) return false;
  const peer = access.direct.get(tid);
  if (peer !== undefined) {
    const requestId = str(msg.requestId) ?? null;
    if (!access.directRequestIds.get(tid)?.has(requestId)) return false;
    return !blockedPeers.has(peer);                            // 直接 1:1/代談：與對方無 active 封鎖才可寫
  }
  if (!access.group.has(tid)) return false;
  const groupRequestId = tid.startsWith('g-') ? tid.slice(2) : '';
  return !!groupRequestId && str(msg.requestId) === groupRequestId;
}

/** me 是否可讀取此 threadId 的訊息（成員精確等值比對；不解析 threadId、不用 includes/startsWith）。 */
export function canReadChatThread(threadId: string, access: ChatAccess): boolean {
  return access.direct.has(threadId) || access.group.has(threadId);
}
