// Sentry 伺服器端初始化（Node.js runtime）。
// 僅在有設定 SENTRY_DSN 時啟用；未設定則完全 no-op，不影響現有運作。
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1, // 效能追蹤取樣（省免費額度）
    enableLogs: false,
  });
}
