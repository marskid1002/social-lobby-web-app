import { NextRequest, NextResponse } from 'next/server';
import { getShared, mergeShared, clearShared, getCollection, type SharedState } from '@/lib/sync-store';
import { getSessionFromRequest, type SessionPayload } from '@/lib/session';

export const dynamic = 'force-dynamic';

// 依登入者角色/身份，只回傳其有權看到的資料（私訊、邀請、通知不外洩）
// 相簿觀看權限：demo 階段已隱藏升級/收費入口（客戶皆為 standard，無法升 vip/premium），
// 故開放所有「登入客戶」觀看小姐相簿；訪客(guest)仍只看大頭照/封面，不下發相簿。
// 未來要恢復付費牆時，把條件改回 (s.tier === 'vip' || s.tier === 'premium') 即可。
function canSeeGalleries(s: SessionPayload): boolean {
  return s.role !== 'guest';
}

function scopeForSession(all: SharedState, s: SessionPayload): SharedState {
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

  const chatMessages = (all.chatMessages ?? []).filter((m) => {
    const x = asRec(m);
    if (!ok(x.senderId)) return false; // 封鎖對象的訊息不下發
    const tid = x.threadId as string;
    if (tid.startsWith('g-')) {
      const reqId = tid.slice(2);
      const req = requests.find((r) => r.id === reqId);
      // 只有 g- 後面真的對應到一個局才算群組；否則（例如參與者 id 恰好以 g- 開頭的自建小姐）落到 1:1 判斷
      const isRealGroup = !!req || responses.some((r) => asRec(r).requestId === reqId);
      if (isRealGroup) {
        if (req && asRec(req).creatorId === me) return true;
        return responses.some((r) => {
          const y = asRec(r);
          return y.requestId === reqId && y.userId === me && y.responseStatus === 'joining';
        });
      }
    }
    return tid.includes(me);
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

// 依 session 過濾 patch 的寫入權限：丟掉「不屬於本人/無權寫」的項目，其餘照存。
// 不整批 403 拒絕——否則一顆外來項（例如啟動時把同步下來的別人資料一起推回）會害整批同步失敗。
// reqCreator：requestId -> creatorId（供驗證「該局發起人」可操作其回應）
function sanitizeWriteAuthz(patch: Record<string, unknown>, s: SessionPayload, reqCreator: Record<string, string>): void {
  const me = s.userId;
  const isManager = s.role === 'manager';
  const keep = (k: string, pred: (it: Record<string, unknown>) => boolean) => {
    if (Array.isArray(patch[k])) patch[k] = (patch[k] as Record<string, unknown>[]).filter(pred);
  };

  // 只有本人能以自己身份建立
  keep('requests', (r) => r.creatorId === me);
  keep('chatMessages', (m) => m.senderId === me);
  keep('registeredUsers', (u) => u.id === me);
  keep('blocks', (b) => b.blockerId === me);
  keep('escorts', (e) => isManager && e.managerId === me);
  // 邀請：本人須為 from/to 一方
  keep('invitations', (i) => i.fromUserId === me || i.toUserId === me);
  // 回應：幹部（派工）／本人（加入）／該局發起人（接受、婉拒）
  keep('responses', (r) => isManager || r.userId === me || reqCreator[r.requestId as string] === me);
  // 通知：幹部／本人為觸發者(actor)或收件人(userId)
  keep('updates', (u) => isManager || u.actorId === me || u.userId === me);
  // 廣場：只能發自己的貼文/留言
  keep('momentPosts', (p) => p.authorId === me);
  keep('plazaComments', (c) => c.userId === me);
  // 小姐狀態/照片/相簿：僅限幹部（非幹部一律清空）
  if (!isManager) {
    for (const k of ['presence', 'photoOverrides', 'photoGalleries']) {
      if (Array.isArray(patch[k])) patch[k] = [];
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const shared = await getShared();
    return NextResponse.json(scopeForSession(shared, session), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[sync GET]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

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

    // 訪客唯讀，不可寫入
    if (session.role === 'guest') {
      return NextResponse.json({ error: 'guest is read-only' }, { status: 403 });
    }

    const patch = body?.patch ?? {};
    stripDataUrlItems(patch); // 丟掉殘留的 dataURL 項目（不整批拒絕），避免一顆壞照片讓整批同步失敗
    sanitizePatch(patch, session); // 權限/等級以伺服器 session 為準，擋自升 tier/role
    // 若寫入含 responses，先取回 requests 建立 creator 對照表以驗證授權
    let reqCreator: Record<string, string> = {};
    if (Array.isArray(patch.responses) && patch.responses.length) {
      const reqs = await getCollection('requests');
      reqCreator = Object.fromEntries(reqs.map((r) => [r.id, (r as { creatorId?: string }).creatorId ?? '']));
    }
    sanitizeWriteAuthz(patch, session, reqCreator); // 丟掉未授權的項目（不整批 403），避免一顆外來項讓整批同步失敗

    const merged = await mergeShared(patch);
    return NextResponse.json(scopeForSession(merged, session));
  } catch (e) {
    console.error('[sync POST]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
