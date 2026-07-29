import { NextResponse } from 'next/server';
import { getSessionFromRequest, type SessionPayload } from './session';
import { getAccountByUserId, type Account } from './auth-store';

/**
 * F：拒絕「已停用／已刪除帳號」用舊 session 寫入。
 *
 * session 是 30 天 JWT，登入後帳號才被 admin 停用或刪除時，只驗 JWT 的 API 仍會放行舊 token。
 * 這個共用 helper 在「使用者發起的寫入」前，除了驗 JWT，還要向帳號儲存層確認帳號仍然有效。
 *
 * 回傳（discriminated union）：
 * - { ok:false, response } —— 已備妥可安全回傳的 HTTP response（401/403），呼叫端直接 return。
 * - { ok:true, session, account, isGuest } —— 通過帳號存活檢查；account 為可信任帳號（guest 為 null）。
 *
 * 語意：
 * - 無 session / JWT 無效 → 401
 * - 帳號已刪除或不存在 → 401（視為失效 session；且不洩漏「帳號是否存在」）
 * - 帳號已停用 disabled → 403
 * - guest：沒有帳號，不做帳號查詢，回傳 isGuest=true，由呼叫端沿用各自既有的訪客政策
 * - 正常啟用帳號 → ok，附上可信任的 session 與 account
 *
 * 一律以 session 與帳號儲存層為準，不信任前端傳來的 userId／role／tier。
 * 錯誤訊息刻意保持一般化，不揭露帳號存在與否、Redis key 或內部資料。
 */
export type ActiveSessionResult =
  | { ok: true; session: SessionPayload; account: Account | null; isGuest: boolean }
  | { ok: false; response: NextResponse };

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

function accountDisabled(): NextResponse {
  return NextResponse.json({ error: '此帳號已被停用' }, { status: 403 });
}

function sessionExpired(): NextResponse {
  return NextResponse.json({ error: '登入狀態已失效，請重新登入' }, { status: 401 });
}

export async function requireActiveSession(req: Request): Promise<ActiveSessionResult> {
  const session = await getSessionFromRequest(req);
  if (!session) return { ok: false, response: unauthorized() };

  // 訪客沒有帳號；不做帳號查詢（查了必為 null 會誤判 401）。呼叫端自行套用既有訪客政策。
  if (session.role === 'guest') return { ok: true, session, account: null, isGuest: true };

  // 每次寫入最多做一次帳號查詢（呼叫端如需 account 直接用回傳值，不要再查第二次）。
  const account = await getAccountByUserId(session.userId);
  if (!account) return { ok: false, response: unauthorized() }; // 已刪除/不存在 → 失效 session（401，不洩漏存在與否）
  if (account.disabled || account.archived) return { ok: false, response: accountDisabled() }; // 已停用/封存 → 403
  if ((session.sessionVersion ?? 0) !== (account.sessionVersion ?? 0)) {
    return { ok: false, response: sessionExpired() };
  }

  return { ok: true, session, account, isGuest: false };
}
