// JUGA Service Worker：Web Push 與安裝版 App 圖示未讀角標。

const BADGE_CACHE = 'juga-app-badge-v1';
const BADGE_KEY = new URL('/__juga_app_badge__', self.location.origin).toString();

function normalizeBadgeCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.floor(count));
}

async function readBadgeState() {
  try {
    const cache = await caches.open(BADGE_CACHE);
    const response = await cache.match(BADGE_KEY);
    if (!response) return { count: 0, keys: [] };
    const text = await response.text();
    try {
      const stored = JSON.parse(text);
      return {
        count: normalizeBadgeCount(stored.count),
        keys: Array.isArray(stored.keys)
          ? [...new Set(stored.keys.filter((key) => typeof key === 'string' && key.length <= 256))]
          : [],
      };
    } catch {
      return { count: normalizeBadgeCount(text), keys: [] };
    }
  } catch {
    return { count: 0, keys: [] };
  }
}

async function applyBadgeCount(count) {
  const badgeNavigator = self.navigator;
  try {
    if (count > 0 && typeof badgeNavigator.setAppBadge === 'function') {
      await badgeNavigator.setAppBadge(count);
    } else if (count === 0 && typeof badgeNavigator.clearAppBadge === 'function') {
      await badgeNavigator.clearAppBadge();
    } else if (count === 0 && typeof badgeNavigator.setAppBadge === 'function') {
      await badgeNavigator.setAppBadge(0);
    }
  } catch {}
}

async function writeBadgeState(value) {
  const keys = Array.isArray(value.keys)
    ? [...new Set(value.keys.filter((key) => typeof key === 'string' && key.length <= 256))]
    : [];
  const count = normalizeBadgeCount(value.count);
  try {
    const cache = await caches.open(BADGE_CACHE);
    if (count > 0) {
      await cache.put(BADGE_KEY, new Response(JSON.stringify({ count, keys }), {
        headers: { 'Content-Type': 'application/json' },
      }));
    } else {
      await cache.delete(BADGE_KEY);
    }
  } catch {}
  await applyBadgeCount(count);
  return { count, keys };
}

async function addBadgeKey(value) {
  const key = typeof value === 'string' && value.length <= 256 ? value : '';
  if (!key) return readBadgeState();
  const state = await readBadgeState();
  if (state.keys.includes(key)) return state;
  return writeBadgeState({ count: state.count + 1, keys: [...state.keys, key] });
}

self.addEventListener('push', (event) => {
  let data = { title: 'JUGA', body: '你有一則新的通知，點擊查看。', url: '/' };

  if (event.data) {
    try {
      data = { ...data, ...JSON.parse(event.data.text()) };
    } catch {}
  }

  const badgeUpdate = data.badgeKey ? addBadgeKey(data.badgeKey) : Promise.resolve();

  event.waitUntil(Promise.all([
    badgeUpdate,
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url },
      vibrate: [200, 100, 200],
    }),
  ]));
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'SET_APP_BADGE') return;
  event.waitUntil(writeBadgeState({ count: event.data.count, keys: event.data.keys }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    clients.claim(),
    readBadgeState().then((state) => applyBadgeCount(state.count)),
  ]));
});
