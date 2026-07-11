// Sentry Edge runtime 初始化（middleware 等）。未設 SENTRY_DSN 則 no-op。
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    enableLogs: false,
  });
}
