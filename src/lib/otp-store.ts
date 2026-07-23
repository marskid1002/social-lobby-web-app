/**
 * 一次性簡訊驗證碼（OTP）存取層。
 * - 只存「雜湊後」的驗證碼，絕不存明碼、也不回傳前端。
 * - 5 分鐘到期、最多錯 5 次即失效、驗證成功後立即刪除（一次性）。
 * - 生產：Upstash/KV Redis；本地無 Redis：記憶體 fallback（重啟即失效，僅供開發）。
 */

import crypto from 'crypto';
import { getRedis, kvKey } from './kv';

const TTL_SEC = 5 * 60;   // 驗證碼有效 5 分鐘
const MAX_ATTEMPTS = 5;   // 最多嘗試次數

export type OtpPurpose = 'register' | 'reset';

interface OtpRecord {
  hash: string;      // sha256(phone:code)
  exp: number;       // 到期時間（epoch ms）
  attempts: number;  // 已嘗試次數
}

// 本地無 Redis 時的記憶體儲存
const mem = new Map<string, OtpRecord>();

function key(purpose: OtpPurpose, phone: string): string {
  return kvKey(`sl:otp:${purpose}:${phone}`);
}

function hashCode(phone: string, code: string): string {
  return crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

/** 產生 6 碼數字驗證碼（密碼學隨機）。 */
export function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** 儲存驗證碼（覆寫同 purpose+phone 的舊碼）。 */
export async function saveOtp(purpose: OtpPurpose, phone: string, code: string): Promise<void> {
  const rec: OtpRecord = { hash: hashCode(phone, code), exp: Date.now() + TTL_SEC * 1000, attempts: 0 };
  const k = key(purpose, phone);
  const redis = getRedis();
  if (redis) await redis.set(k, rec, { ex: TTL_SEC });
  else mem.set(k, rec);
}

async function readRec(k: string): Promise<OtpRecord | null> {
  const redis = getRedis();
  if (redis) return ((await redis.get(k)) as OtpRecord | null) ?? null;
  const rec = mem.get(k);
  if (!rec) return null;
  if (Date.now() > rec.exp) { mem.delete(k); return null; }
  return rec;
}

async function delRec(k: string): Promise<void> {
  const redis = getRedis();
  if (redis) await redis.del(k);
  else mem.delete(k);
}

async function bumpAttempts(k: string, rec: OtpRecord): Promise<void> {
  const redis = getRedis();
  if (redis) {
    // 保留原到期時間，不因錯誤嘗試而延長視窗
    const remain = Math.max(1, Math.ceil((rec.exp - Date.now()) / 1000));
    await redis.set(k, rec, { ex: remain });
  } else {
    mem.set(k, rec);
  }
}

/**
 * 驗證碼比對。成功即刪除（一次性）。
 * @returns ok=true 表通過；否則附上原因（前端可顯示）。
 */
export async function verifyOtp(purpose: OtpPurpose, phone: string, code: string): Promise<{ ok: boolean; reason?: string }> {
  const k = key(purpose, phone);
  const rec = await readRec(k);
  if (!rec) return { ok: false, reason: '驗證碼不存在或已過期，請重新取得' };
  if (Date.now() > rec.exp) { await delRec(k); return { ok: false, reason: '驗證碼已過期，請重新取得' }; }
  if (rec.attempts >= MAX_ATTEMPTS) { await delRec(k); return { ok: false, reason: '錯誤次數過多，請重新取得驗證碼' }; }

  const candidate = Buffer.from(hashCode(phone, String(code ?? '')), 'hex');
  const expected = Buffer.from(rec.hash, 'hex');
  const match = candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  if (!match) {
    rec.attempts += 1;
    await bumpAttempts(k, rec);
    return { ok: false, reason: '驗證碼錯誤' };
  }

  await delRec(k); // 一次性：用過即刪
  return { ok: true };
}
