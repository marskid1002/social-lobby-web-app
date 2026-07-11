// Sentry 前端（瀏覽器）初始化。未設 NEXT_PUBLIC_SENTRY_DSN 則 no-op。
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // 不啟用 session replay，避免免費額度與隱私顧慮（成人平台）
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

// App Router 前端導航追蹤
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
