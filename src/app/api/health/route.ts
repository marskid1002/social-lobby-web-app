import { NextResponse } from 'next/server';
import { getRedis, isRedisConfigured, keyPrefix } from '@/lib/kv';
import { isSessionSecretConfigured } from '@/lib/session';
import { isSmsConfigured, isProductionEnv } from '@/lib/sms';

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

  const isProd = isProductionEnv(); // 與 sms.ts 共用同一套正式環境判斷
  const sessionSecretConfigured = isSessionSecretConfigured();
  // O：正式簡訊供應商是否設定完整（註冊/忘記密碼所需）；只回 boolean，不揭露任何值
  const smsConfigured = isSmsConfigured();
  // 生產環境必須同時具備：可用 Redis + 已設定 SESSION_SECRET + 正式簡訊已設定完整 才算就緒；
  // 本地開發用記憶體 fallback / 預設密鑰 / console 簡訊視為就緒（smsConfigured 仍如實顯示）
  const ready = isProd ? redisPing && sessionSecretConfigured && smsConfigured : true;

  const bodyData = {
    ready,
    redisConfigured,
    redisPing,
    sessionSecretConfigured,
    smsConfigured,
    sentryConfigured: present('SENTRY_DSN') && present('NEXT_PUBLIC_SENTRY_DSN'),
    keyPrefix: keyPrefix(),
    env: {
      SESSION_SECRET: present('SESSION_SECRET'),
      ADMIN_SECRET: present('ADMIN_SECRET'),
      SENTRY_DSN: present('SENTRY_DSN'),
      NEXT_PUBLIC_SENTRY_DSN: present('NEXT_PUBLIC_SENTRY_DSN'),
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
