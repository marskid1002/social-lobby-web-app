/**
 * 簡訊發送層（供應商可抽換）。金鑰一律讀環境變數，不寫死。
 *
 * SMS_PROVIDER：
 *   'console'（預設 / 測試）：不真的發送，只把驗證碼印到後端 log（僅限非正式環境）
 *   'msgdogs'：接 MsgDogs（簡訊狗）真實發送
 *
 * O（正式環境 fail-closed）：正式環境（NODE_ENV/VERCEL_ENV=production）只有在
 * SMS_PROVIDER=msgdogs 且金鑰完整時才會真的發送；其餘一律回 false，且不得把手機/OTP/payload
 * 寫入 log，避免正式站把 OTP 印到 log、或對使用者假裝發送成功。
 *
 * 本 App 只用簡訊發「OTP 驗證碼」，故對外只暴露 sendOtpSms()（另供 health 用的純判斷函式）。
 */

import crypto from 'crypto';
import type { OtpPurpose } from './otp-store';

// 集中的「正式環境」判斷（health 與 sms 共用同一套，避免各自不一致）。
// 任一成立即視為正式：NODE_ENV=production 或 VERCEL_ENV=production。
// 注意：不可只看是否存在 VERCEL；VERCEL_ENV=preview 不算正式。
export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

// 正式簡訊供應商是否設定完整（供 health readiness 使用）。只回傳 boolean，絕不回傳/記錄任何 secret。
// 條件：SMS_PROVIDER 必須明確為 msgdogs，且 merchant code、secret key，以及註冊/重設兩個 OTP
// 模板 ID（MSGDOGS_OTP_TEMPLATE_REGISTER / MSGDOGS_OTP_TEMPLATE_RESET）皆存在且非空白。
// 本 App 只走 MsgDogs OTP 專用通道（/api/sms/send-otp），故兩個模板 ID 亦為必要設定。
export function isSmsConfigured(): boolean {
  const provider = (process.env.SMS_PROVIDER || '').toLowerCase();
  if (provider !== 'msgdogs') return false; // 未設定 / console / 未知值 → false
  const merchant = (process.env.MSGDOGS_MERCHANT_CODE || '').trim();
  const secret = (process.env.MSGDOGS_SECRET_KEY || '').trim();
  const tplRegister = (process.env.MSGDOGS_OTP_TEMPLATE_REGISTER || '').trim();
  const tplReset = (process.env.MSGDOGS_OTP_TEMPLATE_RESET || '').trim();
  return Boolean(merchant && secret && tplRegister && tplReset);
}

export async function sendOtpSms(phone: string, code: string, purpose: OtpPurpose): Promise<boolean> {
  const provider = (process.env.SMS_PROVIDER || 'console').toLowerCase();

  // ── 正式環境：fail-closed ──────────────────────────────────────────────────
  // 絕不 fallback 到 console、絕不把手機/OTP/payload 寫入 log；未設定完整一律回 false。
  if (isProductionEnv()) {
    if (provider !== 'msgdogs') {
      // 未設定 / console / 未知值 → 不發送、不印 OTP，只記一般設定錯誤（不含手機/OTP/payload）
      console.error('[sms] production SMS provider is not configured');
      return false;
    }
    if (!isSmsConfigured()) {
      // msgdogs 但缺必要金鑰 → 不呼叫 fetch，只指出「缺少設定」（不含 secret/手機/OTP）
      console.error('[sms] production SMS provider is missing required credentials');
      return false;
    }
    return sendViaMsgDogs(phone, code, purpose);
  }

  // ── 本地 development：保留既有開發體驗 ────────────────────────────────────────
  if (provider === 'console') {
    // 測試模式：不真的發送，只把驗證碼印到後端 log（僅限非正式環境）
    console.log(`[sms:test] → ${phone}｜驗證碼 ${code}（${purpose}）`);
    return true;
  }
  if (provider === 'msgdogs') {
    return sendViaMsgDogs(phone, code, purpose);
  }
  console.error(`[sms] 未知的 SMS_PROVIDER: ${provider}`);
  return false;
}

// ── MsgDogs（簡訊狗）──────────────────────────────────────────────────────────

function md5(input: string): string {
  return crypto.createHash('md5').update(input, 'utf8').digest('hex');
}

/**
 * MsgDogs 簽章：參數名「升序」排列成 name=value，用 "|" 串接，
 * 最後再附上 accessKey=<secret>，整串取 MD5。（見官方 PHP 範例）
 * 只納入「有值」的參數；sign 本身不參與。
 */
function msgdogsSign(params: Record<string, string>, secret: string): string {
  const lines = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`);
  lines.push(`accessKey=${secret}`);
  return md5(lines.join('|'));
}

/**
 * 將手機號整理成 MsgDogs 需要的格式。
 * 預設把台灣手機（09xxxxxxxx）轉成國際碼 8869xxxxxxxx（國際通道通常需要國碼）；
 * 若你的帳號要吃本地格式，設 MSGDOGS_PHONE_FORMAT=raw 即用原樣數字。
 */
function formatMobile(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  const fmt = (process.env.MSGDOGS_PHONE_FORMAT || 'tw886').toLowerCase();
  if (fmt === 'raw') return digits;
  if (digits.startsWith('886')) return digits;
  if (digits.startsWith('0')) return `886${digits.slice(1)}`;
  return digits;
}

// 依用途讀取 MsgDogs OTP 模板 ID（一律讀環境變數、不寫死；register / reset 分開）。
// 回空字串代表未設定；正式環境的完整性由 isSmsConfigured() 把關。
function otpTemplateId(purpose: OtpPurpose): string {
  return purpose === 'reset'
    ? (process.env.MSGDOGS_OTP_TEMPLATE_RESET || '').trim()
    : (process.env.MSGDOGS_OTP_TEMPLATE_REGISTER || '').trim();
}

// 只走 MsgDogs OTP 專用通道（/api/sms/send-otp）；不再有單條簡訊通道或自訂內文模式。
async function sendViaMsgDogs(phone: string, code: string, purpose: OtpPurpose): Promise<boolean> {
  const merchant = process.env.MSGDOGS_MERCHANT_CODE;
  const secret = process.env.MSGDOGS_SECRET_KEY; // = accessKey
  if (!merchant || !secret) {
    console.error('[sms] 缺少 MSGDOGS_MERCHANT_CODE / MSGDOGS_SECRET_KEY');
    return false;
  }

  const template = otpTemplateId(purpose);
  if (!template) {
    // 缺少該用途的 OTP 模板 ID → 不呼叫 fetch（正式環境已由 isSmsConfigured 擋在前，這裡是雙保險）
    console.error('[sms] 缺少 MsgDogs OTP 模板 ID（MSGDOGS_OTP_TEMPLATE_REGISTER / _RESET）');
    return false;
  }

  const base = (process.env.MSGDOGS_BASE_URL || 'https://www.msgdogs.com').replace(/\/$/, '');
  const timestamp = String(Math.floor(Date.now() / 1000)); // 官方範例用 time()（秒）
  const mobile = formatMobile(phone);

  // OTP 模板（如 1088）內文只有 ${code}，故 variable_data 只帶 { code }，不帶 tag。
  const url = `${base}/api/sms/send-otp`;
  const params: Record<string, string> = {
    merchant_code: merchant,
    mobile,
    otp_template_id: template,
    variable_data: JSON.stringify({ code }),
    timestamp,
  };

  const sign = msgdogsSign(params, secret);
  const payload: Record<string, string> = { ...params, sign };

  try {
    const useJson = (process.env.MSGDOGS_CONTENT_TYPE || 'form').toLowerCase() === 'json';
    const res = useJson
      ? await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(payload).toString(),
        });

    const data = (await res.json().catch(() => null)) as
      | { error?: boolean; code?: number; msg?: string | null }
      | null;
    const ok = Boolean(res.ok && data && data.error === false && data.code === 200);
    // 只記錄非敏感的 HTTP status 與 provider 錯誤碼；不 stringify 完整 response（可能回顯內容），
    // 更不記錄手機、OTP、payload、sign 或 secret。
    if (!ok) console.error('[sms] MsgDogs send failed', 'http', res.status, 'providerCode', data?.code ?? 'n/a');
    return ok;
  } catch (e) {
    // 只記錄錯誤分類名稱，不輸出可能含 URL/payload 的完整錯誤物件
    console.error('[sms] MsgDogs request threw', e instanceof Error ? e.name : 'unknown');
    return false;
  }
}
