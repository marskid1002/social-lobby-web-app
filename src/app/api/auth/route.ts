import { NextRequest, NextResponse } from 'next/server';
import {
  getAccount, createCustomer, verifyPassword, setInitialPassword,
  adminResetPassword, setCustomerPassword, normalizeKey, normalizePhone, isTestManagerKey,
  activateManagerWithCode,
} from '@/lib/auth-store';
import { signSession, sessionCookieHeader, clearSessionCookieHeader } from '@/lib/session';
import { requireActiveSession } from '@/lib/active-session';
import { rateLimit, clearRateLimit, clientIp } from '@/lib/rate-limit';
import { generateCode, saveOtp, verifyOtp, type OtpPurpose } from '@/lib/otp-store';
import { sendOtpSmsDetailed, isSmsConfigured, type SmsSendResult } from '@/lib/sms';
import { registrationConsentError, TERMS_VERSION } from '@/lib/legal';
import crypto from 'crypto';
import { deviceCookieHeader, recordDeviceSession } from '@/lib/device-store';
import { isTaiwanMobile } from '@/lib/phone';
import { recordFlowTrace } from '@/lib/flow-trace-store';

export const dynamic = 'force-dynamic';

const PW_MIN = 6;
const PW_MAX = 128; // 上限避免 scryptSync 被超長密碼拖成 CPU DoS

// 密碼複雜度規則（所有「設定密碼」流程共用）：長度 PW_MIN~PW_MAX，且需同時包含
// 小寫、大寫、數字與符號（非英數字元）。通過回傳 null；否則回傳可直接顯示的錯誤訊息。
export function passwordRuleError(pw: string): string | null {
  if (pw.length < PW_MIN || pw.length > PW_MAX) return `密碼需 ${PW_MIN}~${PW_MAX} 碼`;
  if (!/[a-z]/.test(pw)) return '密碼需包含小寫英文字母';
  if (!/[A-Z]/.test(pw)) return '密碼需包含大寫英文字母';
  if (!/[0-9]/.test(pw)) return '密碼需包含數字';
  if (!/[^A-Za-z0-9]/.test(pw)) return '密碼需包含符號';
  return null;
}

function isProd(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

async function recordSmsResult(
  result: SmsSendResult,
  purpose: OtpPurpose,
  actorUserId?: string,
): Promise<void> {
  await recordFlowTrace({
    eventType: 'sms.otp',
    outcome: result.ok ? 'success' : 'failure',
    actorUserId,
    entityId: purpose,
    code: result.providerCode ?? result.failureCode,
    detail: [
      `provider=${result.provider}`,
      `purpose=${purpose}`,
      `http=${result.httpStatus ?? 'n/a'}`,
    ].join(';'),
  }).catch((error) => {
    console.error('[sms trace]', error instanceof Error ? error.name : 'UnknownError');
  });
}

// 機密字串 constant-time 比較（避免 timing side-channel，與密碼/OTP 比對風格一致）
function secretEqual(a: string, b: string | undefined): boolean {
  if (!b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// GET：回傳目前 session 身份（供前端校正 currentUserId）
export async function GET(req: NextRequest) {
  const auth = await requireActiveSession(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    user: {
      id: auth.session.userId,
      role: auth.session.role,
      tier: auth.session.tier,
      nickname: auth.account?.nickname,
    },
  });
}

async function withSession(req: NextRequest, user: {
  id: string;
  role: 'user' | 'manager' | 'guest' | 'admin';
  tier: string;
  nickname?: string;
  sessionVersion?: number;
}) {
  const token = await signSession({
    userId: user.id,
    role: user.role,
    tier: user.tier,
    sessionVersion: user.sessionVersion ?? 0,
  });
  const res = NextResponse.json({ ok: true, user });
  res.headers.set('Set-Cookie', sessionCookieHeader(token));
  if (user.role !== 'guest') {
    const device = await recordDeviceSession(req, user.id, user.sessionVersion ?? 0);
    res.headers.append('Set-Cookie', deviceCookieHeader(device.id));
  }
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // 訪客：唯讀 session
    if (action === 'guest') {
      return withSession(req, { id: 'u-099', role: 'guest', tier: 'guest', nickname: '訪客' });
    }

    // 登出
    if (action === 'logout') {
      const res = NextResponse.json({ ok: true });
      res.headers.set('Set-Cookie', clearSessionCookieHeader());
      return res;
    }

    const ip = clientIp(req);

    // 管理員重設幹部密碼（需 ADMIN_SECRET）
    if (action === 'admin-reset') {
      // 限流：同 IP 每小時 10 次，避免無限次線上暴力猜 ADMIN_SECRET
      const rl = await rateLimit('admin-reset', ip, 10, 60 * 60);
      if (!rl.ok) return NextResponse.json({ error: 'forbidden' }, { status: 429 });
      if (!secretEqual(String(body.secret ?? ''), process.env.ADMIN_SECRET)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
      const ok = await adminResetPassword(body.account);
      return NextResponse.json({ ok });
    }

    // 發送簡訊驗證碼（註冊 / 忘記密碼共用）
    if (action === 'send-otp') {
      const purpose: OtpPurpose = body.purpose === 'register' ? 'register' : 'reset';
      const phone = normalizePhone(body.phone ?? '');
      if (!isTaiwanMobile(phone)) return NextResponse.json({ error: '請輸入有效台灣手機號碼' }, { status: 400 });

      // 防簡訊轟炸/燒錢：同 IP 每小時 20 次、同號 60 秒冷卻、同號每日 5 次
      const rlIp = await rateLimit('otp-ip', ip, 20, 60 * 60);
      if (!rlIp.ok) return NextResponse.json({ error: `嘗試過於頻繁，請 ${rlIp.retryAfter} 秒後再試` }, { status: 429 });
      const rlCd = await rateLimit('otp-cd', phone, 1, 60);
      if (!rlCd.ok) return NextResponse.json({ error: `請 ${rlCd.retryAfter} 秒後再取得驗證碼` }, { status: 429 });
      const rlDay = await rateLimit('otp-day', phone, 5, 24 * 60 * 60);
      if (!rlDay.ok) return NextResponse.json({ error: '今日取得驗證碼次數已達上限' }, { status: 429 });

      // O：正式環境若簡訊供應商未設定完整，send-otp 整體 fail-closed。此判斷放在查帳號「之前」，
      // 讓 register/reset、帳號存在與否都回相同回應，避免 SMS 故障時被用來探測帳號是否存在。
      if (isProd() && !isSmsConfigured()) {
        return NextResponse.json({ error: '簡訊服務暫時無法使用，請稍後再試' }, { status: 503 });
      }

      const existing = await getAccount(phone);
      // 註冊：手機已註冊就擋（提示改用登入/忘記密碼）
      if (purpose === 'register' && existing) {
        return NextResponse.json({ error: '此手機已註冊，請直接登入或使用忘記密碼' }, { status: 409 });
      }
      // 註冊一律發碼；忘記密碼對「查無此號/非客戶」回 ok 但不發（不洩漏是否註冊）
      const shouldSend = purpose === 'register' ? true : Boolean(existing && existing.role === 'user');
      const code = generateCode();
      let delivered = false;
      if (shouldSend) {
        const delivery = await sendOtpSmsDetailed(phone, code, purpose);
        await recordSmsResult(delivery, purpose, existing?.userId);
        delivered = delivery.ok;
        if (delivered) await saveOtp(purpose, phone, code);
        // 忘記密碼必須永遠回相同結果：供應商執行期失敗不可洩漏此手機是否有帳號。
        if (!delivery.ok && purpose === 'register') {
          return NextResponse.json({ error: '簡訊發送失敗，請稍後再試' }, { status: 500 });
        }
      }
      const res: { ok: true; devCode?: string } = { ok: true };
      // 本地/非生產且真的發碼：把碼回傳前端方便測試（生產絕不回傳）
      if (!isProd() && shouldSend && delivered) res.devCode = code;
      return NextResponse.json(res);
    }

    // 客戶註冊：手機 + 暱稱 + 密碼 + 簡訊驗證碼
    if (action === 'register') {
      // 限流：同 IP 每小時最多 10 次註冊，抵擋洗註冊
      const rl = await rateLimit('register', ip, 10, 60 * 60);
      if (!rl.ok) return NextResponse.json({ error: `註冊過於頻繁，請 ${rl.retryAfter} 秒後再試` }, { status: 429 });

      const phone = normalizePhone(body.phone ?? '');
      const pw = String(body.password ?? '');
      if (!isTaiwanMobile(phone)) return NextResponse.json({ error: '請輸入有效台灣手機號碼' }, { status: 400 });
      { const e = passwordRuleError(pw); if (e) return NextResponse.json({ error: e }, { status: 400 }); }
      {
        const e = registrationConsentError(body);
        if (e) return NextResponse.json({ error: e }, { status: 400 });
      }
      if (await getAccount(phone)) return NextResponse.json({ error: '此手機已註冊，請直接登入' }, { status: 409 });
      // 驗證簡訊碼（通過即消耗），最後才建立帳號
      const otp = await verifyOtp('register', phone, String(body.code ?? ''));
      if (!otp.ok) return NextResponse.json({ error: otp.reason ?? '驗證碼錯誤' }, { status: 400 });
      const acceptedAt = new Date().toISOString();
      const acc = await createCustomer(phone, pw, body.nickname, {
        termsVersion: TERMS_VERSION,
        acceptedAt,
      });
      return withSession(req, { id: acc.userId, role: 'user', tier: acc.tier, nickname: acc.nickname, sessionVersion: acc.sessionVersion });
    }

    // 忘記密碼：手機 + 簡訊驗證碼 + 新密碼（僅限客戶）
    if (action === 'reset-password') {
      const rl = await rateLimit('reset-pw', ip, 10, 60 * 60);
      if (!rl.ok) return NextResponse.json({ error: `嘗試過於頻繁，請 ${rl.retryAfter} 秒後再試` }, { status: 429 });

      const phone = normalizePhone(body.phone ?? '');
      const pw = String(body.password ?? '');
      if (!isTaiwanMobile(phone)) return NextResponse.json({ error: '請輸入有效台灣手機號碼' }, { status: 400 });
      { const e = passwordRuleError(pw); if (e) return NextResponse.json({ error: e }, { status: 400 }); }
      const otp = await verifyOtp('reset', phone, String(body.code ?? ''));
      // 統一錯誤訊息（不透露「碼不存在 vs 碼錯誤」，避免據此列舉手機是否為客戶）
      if (!otp.ok) return NextResponse.json({ error: '驗證碼錯誤或已過期' }, { status: 400 });
      const ok = await setCustomerPassword(phone, pw);
      if (!ok) return NextResponse.json({ error: '驗證碼錯誤或已過期' }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // 登入：帳號（手機 or A00x）+ 密碼
    if (action === 'login') {
      const key = normalizeKey(body.account ?? '');
      const pw = String(body.password ?? '');
      if (!key || !pw) return NextResponse.json({ error: '請輸入帳號與密碼' }, { status: 400 });
      if (pw.length > PW_MAX) return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });

      // 限流：同 IP 每 15 分鐘 20 次、同帳號每 15 分鐘 10 次；登入成功會清掉帳號計數（見下方）避免正常重登被鎖
      const rlIp = await rateLimit('login-ip', ip, 20, 15 * 60);
      if (!rlIp.ok) return NextResponse.json({ error: `嘗試過於頻繁，請 ${rlIp.retryAfter} 秒後再試` }, { status: 429 });
      const rlAcc = await rateLimit('login-acc', key, 10, 15 * 60);
      if (!rlAcc.ok) return NextResponse.json({ error: `此帳號嘗試過於頻繁，請 ${rlAcc.retryAfter} 秒後再試` }, { status: 429 });

      const acc = await getAccount(key);
      if (!acc) return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });
      if (acc.disabled || acc.archived) return NextResponse.json({ error: '此帳號已被停用' }, { status: 403 });

      // 管理員(A000)首次登入 → 需 ADMIN_SECRET 啟用（只有你手上有），再自設密碼
      if (acc.role === 'admin' && acc.hash === null) {
        if (!secretEqual(String(body.activationCode ?? ''), process.env.ADMIN_SECRET)) {
          return NextResponse.json({ error: '請輸入管理員啟用碼', needActivation: true }, { status: 403 });
        }
        { const e = passwordRuleError(pw); if (e) return NextResponse.json({ error: `首次登入設定密碼：${e}` }, { status: 400 }); }
        const activated = await setInitialPassword(key, pw);
        if (!activated) return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });
        return withSession(req, { id: activated.userId, role: 'admin', tier: activated.tier, nickname: activated.nickname, sessionVersion: activated.sessionVersion });
      }

      // 幹部首次登入 → 以此次密碼設定並寫死（需啟用碼，防止外人搶註可枚舉的 A00x 帳號）
      if (acc.role === 'manager' && acc.hash === null) {
        { const e = passwordRuleError(pw); if (e) return NextResponse.json({ error: `首次登入設定密碼：${e}` }, { status: 400 }); }
        if (acc.activationHash) {
          const activated = await activateManagerWithCode(key, String(body.activationCode ?? ''), pw);
          if (!activated) {
            return NextResponse.json({ error: '請輸入幹部啟用碼', needActivation: true }, { status: 403 });
          }
          return withSession(req, {
            id: activated.userId,
            role: 'manager',
            tier: activated.tier,
            nickname: activated.nickname,
            sessionVersion: activated.sessionVersion,
          });
        }
        // 測試幹部(A011~A020) 用獨立啟用碼 MANAGER_TEST_ACTIVATION_CODE；正式幹部(A001~A010) 維持 MANAGER_ACTIVATION_CODE
        const required = isTestManagerKey(key) ? process.env.MANAGER_TEST_ACTIVATION_CODE : process.env.MANAGER_ACTIVATION_CODE;
        if (required) {
          if (!secretEqual(String(body.activationCode ?? ''), required)) {
            return NextResponse.json({ error: '請輸入幹部啟用碼', needActivation: true }, { status: 403 });
          }
        } else if (isProd() || process.env.VERCEL) {
          // 未設定啟用碼：生產或任何 Vercel 部署一律拒絕首次設密（fail-safe，避免環境判定失準造成搶註）
          return NextResponse.json({ error: '幹部啟用尚未開放，請聯絡管理員' }, { status: 403 });
        }
        const activated = await setInitialPassword(key, pw);
        if (!activated) return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });
        return withSession(req, { id: activated.userId, role: 'manager', tier: activated.tier, nickname: activated.nickname, sessionVersion: activated.sessionVersion });
      }

      if (!verifyPassword(acc, pw)) return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });
      await clearRateLimit('login-acc', key); // 成功登入 → 清掉該帳號失敗計數
      return withSession(req, { id: acc.userId, role: acc.role, tier: acc.tier, nickname: acc.nickname, sessionVersion: acc.sessionVersion });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[auth]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
