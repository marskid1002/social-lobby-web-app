type NavigatorWithBadging = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function normalizeAppBadgeCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function totalAppUnreadCount(...counts: number[]): number {
  return counts.reduce((total, count) => total + normalizeAppBadgeCount(count), 0);
}

export function syncAppBadge(value: number, attentionKeys: string[] = []): void {
  if (typeof navigator === 'undefined') return;

  const count = normalizeAppBadgeCount(value);
  const badgeNavigator = navigator as NavigatorWithBadging;
  const updateBrowserBadge = count > 0
    ? badgeNavigator.setAppBadge?.(count)
    : badgeNavigator.clearAppBadge?.() ?? badgeNavigator.setAppBadge?.(0);
  void updateBrowserBadge?.catch(() => {});

  if (!('serviceWorker' in navigator)) return;
  const message = {
    type: 'SET_APP_BADGE',
    count,
    keys: [...new Set(attentionKeys.filter((key) => typeof key === 'string' && key.length <= 256))],
  };
  navigator.serviceWorker.controller?.postMessage(message);
  void navigator.serviceWorker.getRegistration('/').then((registration) => {
    registration?.active?.postMessage(message);
  }).catch(() => {});
}
