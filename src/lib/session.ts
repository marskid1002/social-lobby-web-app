import { SignJWT, jwtVerify } from 'jose';

// Session cookie 名稱
export const SESSION_COOKIE = 'sl_session';

export interface SessionPayload {
  userId: string;
  role: 'user' | 'manager' | 'guest';
  tier: string;
}

function getSecret(): Uint8Array {
  // 生產必須設 SESSION_SECRET；本地 dev 用固定字串（僅供開發）
  const secret = process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me';
  return new TextEncoder().encode(secret);
}

// 簽發 30 天 session token
export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret());
}

// 驗證 token，回傳 payload 或 null
export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.userId || !payload.role) return null;
    return { userId: String(payload.userId), role: payload.role as SessionPayload['role'], tier: String(payload.tier ?? 'free') };
  } catch {
    return null;
  }
}

// 從 Request 讀出 session（給 API route 用）
export async function getSessionFromRequest(req: Request): Promise<SessionPayload | null> {
  const cookie = req.headers.get('cookie') ?? '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return verifySession(m ? decodeURIComponent(m[1]) : null);
}

// 供 API route 設定 cookie 的字串（HttpOnly + Secure + SameSite）
export function sessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
