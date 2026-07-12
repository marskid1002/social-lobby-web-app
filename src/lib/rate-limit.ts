/**
 * 簡易速率限制（以 Redis 計數，本地無 Redis 時放行）。
 * 用於登入/註冊/首登設密，抵擋暴力破解與洗註冊。
 * 作法：固定視窗計數（INCR + 首次設定 TTL），超過上限即擋下並回傳需等待秒數。
 */

import { getRedis, kvKey } from './kv';

export interface RateResult {
  ok: boolean;      // true = 允許；false = 已超過上限
  remaining: number;
  retryAfter: number; // 秒；ok=false 時為建議等待秒數
}

/**
 * @param bucket 分類（例如 'login'、'register'）
 * @param id     識別鍵（例如 IP、帳號）
 * @param limit  視窗內允許次數
 * @param windowSec 視窗秒數
 */
export async function rateLimit(bucket: string, id: string, limit: number, windowSec: number): Promise<RateResult> {
  const redis = getRedis();
  if (!redis) return { ok: true, remaining: limit, retryAfter: 0 }; // 本地開發無 Redis：放行

  const key = kvKey(`sl:rl:${bucket}:${id}`);
  try {
    const count = (await redis.incr(key)) as number;
    if (count === 1) await redis.expire(key, windowSec); // 首次計數才設定過期
    if (count > limit) {
      const ttl = (await redis.ttl(key)) as number;
      return { ok: false, remaining: 0, retryAfter: ttl > 0 ? ttl : windowSec };
    }
    return { ok: true, remaining: Math.max(0, limit - count), retryAfter: 0 };
  } catch {
    return { ok: true, remaining: limit, retryAfter: 0 }; // Redis 異常時不因限流誤擋登入
  }
}

/** 清除某計數（例如登入成功後清掉該帳號的失敗計數，避免正常重登被誤鎖）。 */
export async function clearRateLimit(bucket: string, id: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try { await redis.del(kvKey(`sl:rl:${bucket}:${id}`)); } catch { /* 忽略 */ }
}

/** 從 Request 取用戶端 IP（Vercel/一般代理）。 */
export function clientIp(req: Request): string {
  const h = req.headers;
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return h.get('x-real-ip') || 'unknown';
}
