/**
 * 共用 Redis(KV) 存取工具：統一連線、環境 key 前綴、就緒檢查。
 * - 支援 Upstash 原生 與 Vercel KV 兩種環境變數命名
 * - key 依環境加前綴（prod/preview/dev），避免不同環境資料互相污染
 */

export function isRedisConfigured(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return Boolean(url && token);
}

export function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const { Redis } = require('@upstash/redis');
  return new Redis({ url, token });
}

// 環境前綴：可用 SL_KEY_PREFIX 覆寫，否則用 Vercel 環境（production/preview/development），本地為 dev
export function keyPrefix(): string {
  return process.env.SL_KEY_PREFIX || process.env.VERCEL_ENV || 'dev';
}

export function kvKey(name: string): string {
  return `${keyPrefix()}:${name}`;
}

// 生產環境卻沒有 Redis → 大聲警告（資料不會持久化 / 跨實例遺失）
export function warnIfRedisMissingInProd(): void {
  if (process.env.NODE_ENV === 'production' && !isRedisConfigured()) {
    console.error('[FATAL] 生產環境未設定 Redis（KV_REST_API_URL/TOKEN 或 UPSTASH_*）— 資料不會持久化，帳號/同步/推播訂閱將遺失。');
  }
}
