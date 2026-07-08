import { NextRequest, NextResponse } from 'next/server';
import { getShared, mergeShared, clearShared, getCollection, type SharedState } from '@/lib/sync-store';
import { getSessionFromRequest, type SessionPayload } from '@/lib/session';

export const dynamic = 'force-dynamic';

// 依登入者角色/身份，只回傳其有權看到的資料（私訊、邀請、通知不外洩）
function scopeForSession(all: SharedState, s: SessionPayload): SharedState {
  const me = s.userId;
  const pub = {
    presence: all.presence ?? [],
    photoOverrides: all.photoOverrides ?? [],
    photoGalleries: all.photoGalleries ?? [],
    registeredUsers: all.registeredUsers ?? [],
  } as Partial<SharedState>;
  const empty: SharedState = {
    requests: [], responses: [], invitations: [], updates: [], chatMessages: [],
    presence: [], photoOverrides: [], photoGalleries: [], registeredUsers: [],
  };

  if (s.role === 'guest') return { ...empty, ...pub } as SharedState;

  const isManager = s.role === 'manager';
  const requests = all.requests ?? [];
  const responses = all.responses ?? [];
  const asRec = (x: unknown) => x as Record<string, unknown>;
  const visibleRequests = isManager ? requests : requests.filter((r) => asRec(r).creatorId === me);
  const visibleReqIds = new Set(visibleRequests.map((r) => r.id));

  const scopedResponses = isManager
    ? responses
    : responses.filter((r) => {
        const x = asRec(r);
        return visibleReqIds.has(x.requestId as string) || x.userId === me || x.dispatcherId === me;
      });

  const invitations = (all.invitations ?? []).filter((i) => {
    const x = asRec(i);
    return x.fromUserId === me || x.toUserId === me || (isManager && x.dispatcherId === me);
  });

  const updates = (all.updates ?? []).filter((u) => asRec(u).userId === me);

  const chatMessages = (all.chatMessages ?? []).filter((m) => {
    const tid = asRec(m).threadId as string;
    if (tid.startsWith('g-')) {
      const reqId = tid.slice(2);
      const req = requests.find((r) => r.id === reqId);
      if (req && asRec(req).creatorId === me) return true;
      return responses.some((r) => {
        const x = asRec(r);
        return x.requestId === reqId && x.userId === me && x.responseStatus === 'joining';
      });
    }
    return tid.includes(me);
  });

  return {
    requests: visibleRequests, responses: scopedResponses, invitations, updates, chatMessages,
    ...pub,
  } as SharedState;
}

// 阻擋把 data: URL（base64 圖片）寫進共享狀態，避免膨脹
function hasDataUrl(patch: Record<string, unknown>): boolean {
  try {
    return JSON.stringify(patch).includes('data:image');
  } catch {
    return false;
  }
}

// 依 session 檢查 patch 寫入權限，回傳違規原因或 null（通過）
// reqCreator：requestId -> creatorId（供驗證「該局發起人」可操作其回應）
function checkWriteAuthz(patch: Record<string, unknown[]>, s: SessionPayload, reqCreator: Record<string, string>): string | null {
  const me = s.userId;
  const isManager = s.role === 'manager';
  const arr = (k: string) => (Array.isArray(patch[k]) ? (patch[k] as Record<string, unknown>[]) : []);

  // 只有本人能以自己身份建立
  for (const r of arr('requests')) if (r.creatorId !== me) return 'requests.creatorId 必須為本人';
  for (const m of arr('chatMessages')) if (m.senderId !== me) return 'chatMessages.senderId 必須為本人';
  for (const u of arr('registeredUsers')) if (u.id !== me) return 'registeredUsers 只能寫入本人';

  // 邀請：本人須為 from/to 一方
  for (const i of arr('invitations')) if (i.fromUserId !== me && i.toUserId !== me) return 'invitations 僅限本人參與者';

  // 回應：幹部（派工）／本人（加入）／該局發起人（接受、婉拒）
  for (const r of arr('responses')) {
    const ok = isManager || r.userId === me || reqCreator[r.requestId as string] === me;
    if (!ok) return 'responses 僅限幹部/本人/該局發起人';
  }

  // 通知：幹部／本人為觸發者(actor)或收件人(userId)
  for (const u of arr('updates')) {
    const ok = isManager || u.actorId === me || u.userId === me;
    if (!ok) return 'updates 僅限幹部/相關本人';
  }

  // 小姐狀態/照片/相簿：僅限幹部
  if (!isManager) {
    for (const k of ['presence', 'photoOverrides', 'photoGalleries'] as const) {
      if (arr(k).length) return `${k} 僅限幹部`;
    }
  }
  return null;
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
      await clearShared();
      return NextResponse.json({ ok: true, cleared: true });
    }

    // 訪客唯讀，不可寫入
    if (session.role === 'guest') {
      return NextResponse.json({ error: 'guest is read-only' }, { status: 403 });
    }

    const patch = body?.patch ?? {};
    if (hasDataUrl(patch)) {
      return NextResponse.json({ error: 'inline image not allowed' }, { status: 400 });
    }
    // 若寫入含 responses，先取回 requests 建立 creator 對照表以驗證授權
    let reqCreator: Record<string, string> = {};
    if (Array.isArray(patch.responses) && patch.responses.length) {
      const reqs = await getCollection('requests');
      reqCreator = Object.fromEntries(reqs.map((r) => [r.id, (r as { creatorId?: string }).creatorId ?? '']));
    }
    const violation = checkWriteAuthz(patch, session, reqCreator);
    if (violation) {
      return NextResponse.json({ error: `forbidden write: ${violation}` }, { status: 403 });
    }

    const merged = await mergeShared(patch);
    return NextResponse.json(scopeForSession(merged, session));
  } catch (e) {
    console.error('[sync POST]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
