import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// 回傳「目前正式部署的版本」。舊 bundle 的前端會拿自己烙進去的 NEXT_PUBLIC_BUILD_SHA
// 來比對；不一致代表有新版部署了 → 前端據此提示/自動更新。
export function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || 'dev';
  return NextResponse.json({ sha }, { headers: { 'Cache-Control': 'no-store' } });
}
