/**
 * 簡訊發送層（供應商可抽換）。金鑰一律讀環境變數，不寫死。
 *
 * SMS_PROVIDER：
 *   'console'（預設 / 測試）：不真的發送，只把驗證碼印到後端 log
 *   'msgdogs'：接 MsgDogs（簡訊狗）真實發送
 *
 * 本 App 只用簡訊發「OTP 驗證碼」，故對外只暴露 sendOtpSms()。
 */

import crypto from 'crypto';
import type { OtpPurpose } from './otp-store';

export async function sendOtpSms(phone: string, code: string, purpose: OtpPurpose): Promise<boolean> {
  const provider = (process.env.SMS_PROVIDER || 'console').toLowerCase();

  if (provider === 'console') {
    // 測試模式：不真的發送，只印在後端 log（方便開發驗證）
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

async function sendViaMsgDogs(phone: string, code: string, purpose: OtpPurpose): Promise<boolean> {
  const merchant = process.env.MSGDOGS_MERCHANT_CODE;
  const secret = process.env.MSGDOGS_SECRET_KEY; // = accessKey
  if (!merchant || !secret) {
    console.error('[sms] 缺少 MSGDOGS_MERCHANT_CODE / MSGDOGS_SECRET_KEY');
    return false;
  }

  const base = (process.env.MSGDOGS_BASE_URL || 'https://www.msgdogs.com').replace(/\/$/, '');
  const timestamp = String(Math.floor(Date.now() / 1000)); // 官方範例用 time()（秒）
  const mobile = formatMobile(phone);
  const mode = (process.env.MSGDOGS_MODE || 'otp').toLowerCase();

  let url: string;
  let params: Record<string, string>;

  if (mode === 'single') {
    // 備用：單條簡訊，帶自由中文內文
    const text = `【Social Lobby】你的驗證碼是 ${code}，5 分鐘內有效，請勿外洩。`;
    url = `${base}/api/sms/send-single`;
    params = { merchant_code: merchant, mobile, template_text: text, timestamp };
  } else {
    // 預設：OTP 專用通道，用模版 + variable_data 帶入驗證碼
    const template =
      purpose === 'reset'
        ? process.env.MSGDOGS_OTP_TEMPLATE_RESET || '5'
        : process.env.MSGDOGS_OTP_TEMPLATE_REGISTER || '6';
    const tag = process.env.MSGDOGS_OTP_TAG || 'SocialLobby';
    const variableData = JSON.stringify({ tag, code });
    url = `${base}/api/sms/send-otp`;
    params = { merchant_code: merchant, mobile, otp_template_id: template, variable_data: variableData, timestamp };
  }

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
    if (!ok) console.error('[sms] MsgDogs 發送失敗', res.status, JSON.stringify(data));
    return ok;
  } catch (e) {
    console.error('[sms] MsgDogs 呼叫例外', e);
    return false;
  }
}
