import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // 固定 Turbopack 專案根目錄，避免因為上層有多個 lockfile 而選錯根目錄（導致路由 404）
  turbopack: {
    root: path.resolve(__dirname),
  },
  // 將「本次建置的版本」烙進前端 bundle，供版本偵測比對（每次部署 commit SHA 會變）。
  // 本機無 Vercel 變數時為 'dev' → 版本偵測會自動停用。
  env: {
    NEXT_PUBLIC_BUILD_SHA:
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || 'dev',
  },
};

// 以 Sentry 包裝設定：未設 SENTRY_AUTH_TOKEN 時自動跳過 source map 上傳，不影響 build。
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  telemetry: false,
});
