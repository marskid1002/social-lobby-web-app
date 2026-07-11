import { NextResponse } from 'next/server';
import { getRedis, isRedisConfigured, keyPrefix } from '@/lib/kv';
import { isSessionSecretConfigured } from '@/lib/session';

export const dynamic = 'force-dynamic';

// 診斷 + 就緒檢查：回報儲存環境變數「是否存在」（不回傳值），並實際 ping Redis。
// 生產環境若沒有可用的 Redis → ready:false 且回 503，讓外部監控能偵測到。
export async function GET() {
  const present = (k: string) => Boolean(process.env[k]);
  const redisConfigured = isRedisConfigured();

  // 實際連線測試（避免只看 env 卻連不上）
  let redisPing = false;
  if (redisConfigured) {
    try {
      const redis = getRedis();
      if (redis) { await redis.ping(); redisPing = true; }
    } catch {
      redisPing = false;
    }
  }

  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  const sessionSecretConfigured = isSessionSecretConfigured();
  // 生產環境必須同時具備：可用 Redis + 已設定 SESSION_SECRET 才算就緒；
  // 本地開發用記憶體 fallback / 預設密鑰視為就緒
  const ready = isProd ? redisPing && sessionSecretConfigured : true;

  const bodyData = {
    ready,
    redisConfigured,
    redisPing,
    sessionSecretConfigured,
    keyPrefix: keyPrefix(),
    env: {
      SESSION_SECRET: present('SESSION_SECRET'),
      ADMIN_SECRET: present('ADMIN_SECRET'),
      UPSTASH_REDIS_REST_URL: present('UPSTASH_REDIS_REST_URL'),
      UPSTASH_REDIS_REST_TOKEN: present('UPSTASH_REDIS_REST_TOKEN'),
      KV_REST_API_URL: present('KV_REST_API_URL'),
      KV_REST_API_TOKEN: present('KV_REST_API_TOKEN'),
      REDIS_URL: present('REDIS_URL'),
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: present('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
      VAPID_PRIVATE_KEY: present('VAPID_PRIVATE_KEY'),
      BLOB_READ_WRITE_TOKEN: present('BLOB_READ_WRITE_TOKEN'),
      BLOB_STORE_ID: present('BLOB_STORE_ID'),
    },
    blobConfigured: present('BLOB_READ_WRITE_TOKEN') || present('BLOB_STORE_ID'),
  };

  return NextResponse.json(bodyData, { status: ready ? 200 : 503 });
}
