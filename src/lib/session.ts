import { SignJWT, jwtVerify } from 'jose';

// Session cookie 名稱
export const SESSION_COOKIE = 'sl_session';

export interface SessionPayload {
  userId: string;
  role: 'user' | 'manager' | 'guest' | 'account_admin' | 'admin';
  tier: string;
  sessionVersion?: number;
  mustChangeNickname?: boolean;
}

// 是否為正式生產環境
function isProd(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

// SESSION_SECRET 是否已正確設定（供 /api/health 就緒檢查）
export function isSessionSecretConfigured(): boolean {
  return Boolean(process.env.SESSION_SECRET);
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  // 生產環境「必須」設 SESSION_SECRET；缺少時直接 throw（fail-safe）：
  // signSession 會 500（登入失敗）、verifySession 會捕捉成 null（全部視為未登入），
  // 兩者都無法用公開已知字串偽造 session，避免安全地基被瓦解。
  if (!secret) {
    if (isProd()) throw new Error('SESSION_SECRET 未設定：生產環境拒絕使用不安全的預設密鑰');
    return new TextEncoder().encode('dev-only-insecure-secret-change-me'); // 僅本地開發
  }
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
    return {
      userId: String(payload.userId),
      role: payload.role as SessionPayload['role'],
      tier: String(payload.tier ?? 'free'),
      sessionVersion: Number(payload.sessionVersion ?? 0),
      mustChangeNickname: payload.mustChangeNickname === true,
    };
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
