import { NextRequest, NextResponse } from 'next/server';
import { getShared, mergeShared, clearShared, getCollection, getResetMarks, SHARED_KEYS, type SharedState, type SharedKey } from '@/lib/sync-store';
import { type SessionPayload } from '@/lib/session';
import { requireActiveSession } from '@/lib/active-session';
import { authorizeWrites, buildIndex } from '@/lib/sync-authz';
import { buildChatAccessIndex, canReadChatThread } from '@/lib/chat-authz';
import { getManagerUserIds } from '@/lib/auth-store';
import { recordAcceptedSyncWrites } from '@/lib/flow-trace';

export const dynamic = 'force-dynamic';

// 依登入者角色/身份，只回傳其有權看到的資料（私訊、邀請、通知不外洩）
// 相簿觀看權限：demo 階段已隱藏升級/收費入口（客戶皆為 standard，無法升 vip/premium），
// 故開放所有「登入客戶」觀看小姐相簿；訪客(guest)仍只看大頭照/封面，不下發相簿。
// 未來要恢復付費牆時，把條件改回 (s.tier === 'vip' || s.tier === 'premium') 即可。
function canSeeGalleries(s: SessionPayload): boolean {
  return s.role !== 'guest';
}

export function scopeForSession(all: SharedState, s: SessionPayload): SharedState {
  const me = s.userId;
  const asRec = (x: unknown) => x as Record<string, unknown>;

  // 與我相關的所有封鎖（含 active:false）：回傳給前端讓「解除封鎖」能收斂到對方端
  const relatedBlocks = (all.blocks ?? []).filter((b) => {
    const x = asRec(b);
    return x.blockerId === me || x.blockedId === me;
  });
  // 實際過濾內容只用「生效中」的封鎖
  const blockedPeers = new Set<string>();
  for (const b of relatedBlocks) {
    const x = asRec(b);
    if (x.active === false) continue;
    if (x.blockerId === me) blockedPeers.add(x.blockedId as string);
    if (x.blockedId === me) blockedPeers.add(x.blockerId as string);
  }
  const ok = (uid: unknown) => uid == null || !blockedPeers.has(uid as string);

  const pub = {
    presence: (all.presence ?? []).filter((p) => ok(asRec(p).id)),
    photoOverrides: (all.photoOverrides ?? []).filter((p) => ok(asRec(p).id)),
    // 相簿：僅付費會員可取得（伺服器端授權，非前端渲染），從源頭擋住照片外洩
    photoGalleries: canSeeGalleries(s) ? (all.photoGalleries ?? []).filter((p) => ok(asRec(p).id)) : [],
    registeredUsers: (all.registeredUsers ?? []).filter((u) => ok(asRec(u).id)),
    blocks: relatedBlocks, // 含 active:false，讓對方端能收斂解除封鎖
    escorts: (all.escorts ?? []).filter((e) => ok(asRec(e).id)), // 幹部自建的小姐（大家可見，供瀏覽/派工）
    // 廣場貼文/留言：公開內容，大家可見（過濾掉封鎖對象的）
    momentPosts: (all.momentPosts ?? []).filter((p) => ok(asRec(p).authorId)),
    plazaComments: (all.plazaComments ?? []).filter((c) => ok(asRec(c).userId)),
  } as Partial<SharedState>;
  const empty: SharedState = {
    requests: [], responses: [], invitations: [], updates: [], chatMessages: [],
    presence: [], photoOverrides: [], photoGalleries: [], registeredUsers: [], blocks: [], escorts: [],
    momentPosts: [], plazaComments: [],
  };

  if (s.role === 'guest') return { ...empty, ...pub } as SharedState;

  const isManager = s.role === 'manager';
  const requests = all.requests ?? [];
  const responses = all.responses ?? [];
  const visibleRequests = (isManager ? requests : requests.filter((r) => asRec(r).creatorId === me))
    .filter((r) => ok(asRec(r).creatorId));
  const visibleReqIds = new Set(visibleRequests.map((r) => r.id));

  const scopedResponses = (isManager
    ? responses
    : responses.filter((r) => {
        const x = asRec(r);
        return visibleReqIds.has(x.requestId as string) || x.userId === me || x.dispatcherId === me;
      })
  ).filter((r) => ok(asRec(r).userId) && ok(asRec(r).dispatcherId));

  const invitations = (all.invitations ?? []).filter((i) => {
    const x = asRec(i);
    return (x.fromUserId === me || x.toUserId === me || (isManager && x.dispatcherId === me))
      && ok(x.fromUserId) && ok(x.toUserId);
  });

  const updates = (all.updates ?? []).filter((u) => asRec(u).userId === me && ok(asRec(u).actorId));

  // D：以「真實 server 關係」算出 me 合法所屬的聊天室集合（1:1 由 invitation 兩端、群組由 creator/joining）；
  // 讀取端不帶 writable（歷史含已過期/非 accepted 仍可讀），並對 threadId 做「精確等值」比對，
  // 杜絕舊 includes/startsWith 的子字串碰撞（u-01 不得看到只屬於 u-010 的聊天室）。
  const chatAccess = buildChatAccessIndex(me, {
    invitations: all.invitations ?? [],
    responses: all.responses ?? [],
    requests: all.requests ?? [],
  });
  const chatMessages = (all.chatMessages ?? []).filter((m) => {
    // 防污染資料造成整個 GET 拋例外：非物件、senderId 非字串、threadId 非字串/空 → 一律不下發（GET 仍 200）
    if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
    const x = asRec(m);
    if (typeof x.senderId !== 'string') return false; // senderId 型別錯 → 不下發
    if (!ok(x.senderId)) return false; // 封鎖對象的訊息不下發（既有行為保留；不刪歷史）
    const tid = typeof x.threadId === 'string' ? x.threadId : ''; // 非字串 threadId → 視為空
    if (!tid) return false; // 空/未知 threadId → 不下發
    return canReadChatThread(tid, chatAccess); // 精確成員比對；非成員不得收到
  });

  return {
    requests: visibleRequests, responses: scopedResponses, invitations, updates, chatMessages,
    ...pub,
  } as SharedState;
}

// 清洗 registeredUsers 寫入：權限/等級一律以 session 為準，並移除 client 傳入的點數/額度，
// 防止客戶自行把 tier 改成 vip、role 改成 manager 提權，或竄改經濟欄位。
function sanitizePatch(patch: Record<string, unknown>, s: SessionPayload): void {
  const me = s.userId;
  const ru = patch.registeredUsers;
  if (Array.isArray(ru)) {
    // 只保留本人（丟掉 poll 併入的他人帳號，避免外來項導致整批 403）；權限/等級以 session 為準、剔除經濟欄位
    patch.registeredUsers = ru
      .filter((u) => (u as Record<string, unknown>).id === me)
      .map((u) => {
        const rest = { ...(u as Record<string, unknown>) };
        delete rest.credits;
        delete rest.monthlyRequestsLeft;
        return { ...rest, role: s.role === 'guest' ? 'user' : s.role, tier: s.tier };
      });
  }
  const bl = patch.blocks;
  if (Array.isArray(bl)) {
    // 只保留本人建立的封鎖（丟掉「別人封鎖我」的外來項，避免整批 403）
    patch.blocks = bl.filter((b) => (b as Record<string, unknown>).blockerId === me);
  }
  const es = patch.escorts;
  if (Array.isArray(es)) {
    // 只接受「本來就屬於本人」的小姐（managerId===me），其餘丟棄；不覆寫 managerId，
    // 避免有人把別人的小姐送上來被蓋成自己名下（過戶漏洞）。新建的小姐 client 已帶 managerId=me。
    patch.escorts = es.filter((e) => (e as Record<string, unknown>).managerId === me);
  }
}

// 移除任何含 data: 內嵌圖片的項目（避免膨脹）。只丟違規項、不整批拒絕：
// 否則一顆殘留的 dataURL（例如舊版 Blob 上傳失敗留下的）會讓整批 patch 被擋，
// 連帶 presence/escorts/requests… 全部同步失敗（一顆老鼠屎壞一鍋粥）。
function stripDataUrlItems(patch: Record<string, unknown>): void {
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (Array.isArray(v)) {
      const cleaned = v.filter((it) => {
        try { return !JSON.stringify(it).includes('data:image'); } catch { return true; }
      });
      if (cleaned.length !== v.length) patch[k] = cleaned;
    }
  }
}

// 物件層級寫入授權已抽到純模組 @/lib/sync-authz（authorizeWrites），route POST 內批次預讀後呼叫。

// ── C：寫入 shape 驗證 ────────────────────────────────────────────────────
// 目的：擋掉惡意/損壞的同步資料（例如 threadId:null 的 chatMessage），避免它們寫入後
// 讓所有人的 /api/sync GET/POST 在 scopeForSession 時對 null 呼叫字串方法而整批 500（DoS）。
// 策略：請求層結構錯誤 → 400；集合非陣列/超量 → 400；單筆項目格式錯 → 丟棄該筆（不整批拒絕，
// 沿用本檔既有「壞一顆丟一顆、不壞整鍋」的設計）。只有 SharedState 已定義的集合會被保留。
const MAX_KEYS_IN_REQUEST = 50;         // 單次請求最多幾個 key（含未知；防洗 key）
// 單一集合筆數上限：此為「payload/DoS 安全天花板」，不是業務上限。
// 重點：驗證發生在授權過濾(sanitizeWriteAuthz)之前，而前端 full-snapshot 同步（startSync 的 initPatch）
// 會把「本機所有項目」整包送上來——對 manager 而言包含全站 requests/responses，且其中很多是
// 「剛從 server 同步下來的他人項目」（稍後才會被授權過濾丟掉）。因此上限必須遠高於合法快照大小，
// 否則會在授權前就把合法的本人物件連同外來項一起整批擋成 400。
// 取 20000：遠超過上線初期任何集合的真實筆數，且與平台請求 body 大小限制（Vercel ~4.5MB，
// 單筆項目約數百 bytes ≈ 上萬筆才會觸及）大致同量級——只擋病態/惡意的超大 payload。
// 註：這是暫時的安全天花板；若未來資料量真的逼近此值，正解是改為增量同步(delta sync)，本次不做。
const MAX_ITEMS_PER_COLLECTION = 20000;
const MAX_ID_LEN = 128;                 // id / requestId 長度上限
const MAX_THREADID_LEN = 256;           // threadId 長度上限
const MAX_TEXT_LEN = 4000;              // 聊天內文長度上限
const MAX_URL_LEN = 2048;               // imageUrl 長度上限

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyStr = (v: unknown, max: number): boolean =>
  typeof v === 'string' && v.length > 0 && v.length <= max;

// chatMessages 逐筆嚴格驗證：threadId/senderId/createdAt 必為合法非空字串，否則整筆丟棄
function isValidChatMessage(it: unknown): boolean {
  if (!isPlainObject(it)) return false;
  if (!isNonEmptyStr(it.id, MAX_ID_LEN)) return false;
  if (!isNonEmptyStr(it.threadId, MAX_THREADID_LEN)) return false;
  if (!isNonEmptyStr(it.senderId, MAX_ID_LEN)) return false;
  if (!isNonEmptyStr(it.createdAt, 64) || Number.isNaN(Date.parse(it.createdAt as string))) return false;
  if (typeof it.text !== 'string' || it.text.length > MAX_TEXT_LEN) return false; // text 可為空字串，但須為字串且有長度上限
  if (it.imageUrl !== undefined && (typeof it.imageUrl !== 'string' || it.imageUrl.length > MAX_URL_LEN)) return false;
  if (it.requestId !== undefined && (typeof it.requestId !== 'string' || it.requestId.length > MAX_ID_LEN)) return false;
  return true;
}

export type ShapeResult =
  | { ok: true; patch: Record<string, unknown[]> }
  | { ok: false; error: string };

// 驗證並清洗 body.patch。回傳只含合法集合鍵與合法項目的新 patch；結構性錯誤回 ok:false。
export function validatePatchShape(rawPatch: unknown): ShapeResult {
  if (!isPlainObject(rawPatch)) return { ok: false, error: 'patch must be a non-null, non-array object' };
  const keys = Object.keys(rawPatch);
  if (keys.length > MAX_KEYS_IN_REQUEST) return { ok: false, error: 'too many keys in patch' };

  const clean: Record<string, unknown[]> = {};
  for (const key of keys) {
    if (!(SHARED_KEYS as readonly string[]).includes(key)) continue; // 未知集合鍵：忽略、不存
    const val = rawPatch[key];
    if (!Array.isArray(val)) return { ok: false, error: `collection ${key} must be an array` };
    if (val.length > MAX_ITEMS_PER_COLLECTION) return { ok: false, error: `collection ${key} exceeds item limit` };
    clean[key] = key === 'chatMessages'
      ? val.filter(isValidChatMessage)
      : val.filter((it) => isPlainObject(it) && isNonEmptyStr(it.id, MAX_ID_LEN));
  }
  return { ok: true, patch: clean };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    const session = auth.session;
    const shared = await getShared();
    const resetAt = await getResetMarks();
    return NextResponse.json({ ...scopeForSession(shared, session), resetAt }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[sync GET]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // F：驗證 session 對應帳號仍有效（含登入後才被停用/刪除者）；失敗直接回 401/403，
    // 且在 mergeShared 及任何 Redis 寫入之前完成。guest 交由下方既有「訪客唯讀」政策處理。
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    const session = auth.session;

    const body = await req.json();

    // 清庫僅限帶正確 ADMIN_SECRET
    if (body?.reset) {
      if (!process.env.ADMIN_SECRET || body.secret !== process.env.ADMIN_SECRET) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
      // body.collections 指定只清哪些集合（例如只清局/對話）；未指定則全清
      const cols = Array.isArray(body.collections) ? (body.collections as string[]) : undefined;
      await clearShared(cols);
      return NextResponse.json({ ok: true, cleared: cols ?? 'all' });
    }

    // 訪客唯讀，不可寫入（沿用既有行為）
    if (auth.isGuest) {
      return NextResponse.json({ error: 'guest is read-only' }, { status: 403 });
    }

    // C：先做 shape 驗證（擋惡意/損壞資料造成同步整批 500）；通過後才進後續清洗流程
    const shape = validatePatchShape(body?.patch ?? {});
    if (!shape.ok) return NextResponse.json({ error: shape.error }, { status: 400 });
    const patch: Record<string, unknown> = shape.patch;
    stripDataUrlItems(patch); // 丟掉殘留的 dataURL 項目（不整批拒絕），避免一顆壞照片讓整批同步失敗
    sanitizePatch(patch, session); // 權限/等級以伺服器 session 為準，擋自升 tier/role（economic 欄位剔除）

    // B：物件層級寫入授權——批次預讀「授權需要」的 server 集合、建 by-id index，逐筆授權。
    // 既有物件一律以 server stored object 為權威、update 凍結不可變欄位；未授權項逐筆丟棄、合法項照存（不整批失敗）。
    const need = new Set<string>(['escorts', 'requests', 'responses']); // 關係依賴＋managed girls：恆需
    if (Array.isArray(patch.invitations) || Array.isArray(patch.updates)) need.add('invitations'); // updates 的 invite_* 需比對邀請
    if (Array.isArray(patch.updates)) need.add('updates'); // updates append-only 需既有 id
    // D：chatMessages 授權需 invitations（成員）＋blocks（封鎖）＋chatMessages（append-only 既有 id）
    if (Array.isArray(patch.chatMessages)) { need.add('invitations'); need.add('blocks'); need.add('chatMessages'); }
    for (const k of ['blocks', 'momentPosts', 'plazaComments'] as const) if (Array.isArray(patch[k])) need.add(k);
    const cols: Record<string, { id: string; [k: string]: unknown }[]> = {};
    await Promise.all([...need].map(async (k) => { cols[k] = await getCollection(k as SharedKey); }));
    // request_posted 通知收件人須為 server 權威幹部帳號；僅在 patch 含 updates 時多讀一次帳號
    const managerUserIds = Array.isArray(patch.updates) ? await getManagerUserIds() : [];
    const authzPatch = authorizeWrites(patch, session, buildIndex(cols, managerUserIds));

    const merged = await mergeShared(authzPatch);
    await recordAcceptedSyncWrites({
      patch: authzPatch,
      existing: cols,
      session,
    }).catch((error) => {
      // 診斷紀錄不可反過來讓主要流程失敗。
      console.error('[flow trace sync]', error instanceof Error ? error.name : 'UnknownError');
    });
    const resetAt = await getResetMarks();
    return NextResponse.json({ ...scopeForSession(merged, session), resetAt });
  } catch (e) {
    console.error('[sync POST]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
