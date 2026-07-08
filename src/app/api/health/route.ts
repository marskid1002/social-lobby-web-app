import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// 診斷用：只回報儲存相關環境變數「是否存在」，不回傳實際值
export async function GET() {
  const present = (k: string) => Boolean(process.env[k]);
  return NextResponse.json({
    redisConfigured:
      (present('UPSTASH_REDIS_REST_URL') && present('UPSTASH_REDIS_REST_TOKEN')) ||
      (present('KV_REST_API_URL') && present('KV_REST_API_TOKEN')),
    env: {
      UPSTASH_REDIS_REST_URL: present('UPSTASH_REDIS_REST_URL'),
      UPSTASH_REDIS_REST_TOKEN: present('UPSTASH_REDIS_REST_TOKEN'),
      KV_REST_API_URL: present('KV_REST_API_URL'),
      KV_REST_API_TOKEN: present('KV_REST_API_TOKEN'),
      REDIS_URL: present('REDIS_URL'),
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: present('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
      VAPID_PRIVATE_KEY: present('VAPID_PRIVATE_KEY'),
      BLOB_READ_WRITE_TOKEN: present('BLOB_READ_WRITE_TOKEN'),
    },
    blobConfigured: present('BLOB_READ_WRITE_TOKEN'),
  });
}
