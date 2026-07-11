import { NextRequest, NextResponse } from 'next/server';
import {
  getAccount, createCustomer, verifyPassword, setInitialPassword,
  adminResetPassword, normalizeKey, normalizePhone,
} from '@/lib/auth-store';
import { signSession, sessionCookieHeader, clearSessionCookieHeader, getSessionFromRequest } from '@/lib/session';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const PW_MIN = 6;
const PW_MAX = 128; // 上限避免 scryptSync 被超長密碼拖成 CPU DoS

function isProd(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

// GET：回傳目前 session 身份（供前端校正 currentUserId）
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: { id: session.userId, role: session.role, tier: session.tier } });
}

async function withSession(user: { id: string; role: 'user' | 'manager' | 'guest'; tier: string; nickname?: string }) {
  const token = await signSession({ userId: user.id, role: user.role, tier: user.tier });
  const res = NextResponse.json({ ok: true, user });
  res.headers.set('Set-Cookie', sessionCookieHeader(token));
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // 訪客：唯讀 session
    if (action === 'guest') {
      return withSession({ id: 'u-099', role: 'guest', tier: 'guest', nickname: '訪客' });
    }

    // 登出
    if (action === 'logout') {
      const res = NextResponse.json({ ok: true });
      res.headers.set('Set-Cookie', clearSessionCookieHeader());
      return res;
    }

    // 管理員重設幹部密碼（需 ADMIN_SECRET）
    if (action === 'admin-reset') {
      if (!process.env.ADMIN_SECRET || body.secret !== process.env.ADMIN_SECRET) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
      const ok = await adminResetPassword(body.account);
      return NextResponse.json({ ok });
    }

    const ip = clientIp(req);

    // 客戶註冊：手機 + 暱稱 + 密碼
    if (action === 'register') {
      // 限流：同 IP 每小時最多 10 次註冊，抵擋洗註冊
      const rl = await rateLimit('register', ip, 10, 60 * 60);
      if (!rl.ok) return NextResponse.json({ error: `註冊過於頻繁，請 ${rl.retryAfter} 秒後再試` }, { status: 429 });

      const phone = normalizePhone(body.phone ?? '');
      const pw = String(body.password ?? '');
      if (phone.length < 8) return NextResponse.json({ error: '請輸入有效手機號碼' }, { status: 400 });
      if (pw.length < PW_MIN || pw.length > PW_MAX) return NextResponse.json({ error: `密碼需 ${PW_MIN}~${PW_MAX} 碼` }, { status: 400 });
      if (await getAccount(phone)) return NextResponse.json({ error: '此手機已註冊，請直接登入' }, { status: 409 });
      const acc = await createCustomer(phone, pw, body.nickname);
      return withSession({ id: acc.userId, role: 'user', tier: acc.tier, nickname: acc.nickname });
    }

    // 登入：帳號（手機 or A00x）+ 密碼
    if (action === 'login') {
      const key = normalizeKey(body.account ?? '');
      const pw = String(body.password ?? '');
      if (!key || !pw) return NextResponse.json({ error: '請輸入帳號與密碼' }, { status: 400 });
      if (pw.length > PW_MAX) return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });

      // 限流：同 IP 每 15 分鐘 20 次、同帳號每 15 分鐘 10 次失敗嘗試
      const rlIp = await rateLimit('login-ip', ip, 20, 15 * 60);
      if (!rlIp.ok) return NextResponse.json({ error: `嘗試過於頻繁，請 ${rlIp.retryAfter} 秒後再試` }, { status: 429 });
      const rlAcc = await rateLimit('login-acc', key, 10, 15 * 60);
      if (!rlAcc.ok) return NextResponse.json({ error: `此帳號嘗試過於頻繁，請 ${rlAcc.retryAfter} 秒後再試` }, { status: 429 });

      const acc = await getAccount(key);
      if (!acc) return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });

      // 幹部首次登入 → 以此次密碼設定並寫死（需啟用碼，防止外人搶註可枚舉的 A00x 帳號）
      if (acc.role === 'manager' && acc.hash === null) {
        const required = process.env.MANAGER_ACTIVATION_CODE;
        if (required) {
          if (String(body.activationCode ?? '') !== required) {
            return NextResponse.json({ error: '請輸入幹部啟用碼', needActivation: true }, { status: 403 });
          }
        } else if (isProd()) {
          // 生產環境未設定啟用碼 → 拒絕首次設密（fail-safe，避免無防護的搶註）
          return NextResponse.json({ error: '幹部啟用尚未開放，請聯絡管理員' }, { status: 403 });
        }
        if (pw.length < PW_MIN || pw.length > PW_MAX) return NextResponse.json({ error: `首次登入請設定 ${PW_MIN}~${PW_MAX} 碼密碼` }, { status: 400 });
        const activated = await setInitialPassword(key, pw);
        if (!activated) return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });
        return withSession({ id: activated.userId, role: 'manager', tier: activated.tier, nickname: activated.nickname });
      }

      if (!verifyPassword(acc, pw)) return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });
      return withSession({ id: acc.userId, role: acc.role, tier: acc.tier, nickname: acc.nickname });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[auth]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
