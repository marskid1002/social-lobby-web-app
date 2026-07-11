import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // 固定 Turbopack 專案根目錄，避免因為上層有多個 lockfile 而選錯根目錄（導致路由 404）
  turbopack: {
    root: path.resolve(__dirname),
  },
};

// 以 Sentry 包裝設定：未設 SENTRY_AUTH_TOKEN 時自動跳過 source map 上傳，不影響 build。
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  telemetry: false,
});
