// Next.js instrumentation hook：依 runtime 載入對應的 Sentry 設定，並回報 request 錯誤。
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

// 捕捉 App Router 伺服器端錯誤
export const onRequestError = Sentry.captureRequestError;
