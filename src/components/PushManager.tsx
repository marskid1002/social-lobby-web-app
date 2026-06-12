'use client';

import { useEffect } from 'react';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/**
 * 初始化 Service Worker 並訂閱 Web Push。
 * 掛載在 app layout，靜默執行，不顯示任何 UI。
 */
export function PushManager() {
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) return;

    async function init() {
      try {
        // 1. 註冊 Service Worker
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        // 2. 等待 SW 啟動
        await navigator.serviceWorker.ready;

        // 3. 檢查現有訂閱
        let sub = await reg.pushManager.getSubscription();

        // 4. 沒有訂閱時請求權限並建立訂閱
        if (!sub) {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') return;

          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        }

        // 5. 將訂閱傳送到 server
        await fetch('/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub),
        });
      } catch (e) {
        console.warn('[PushManager] 初始化失敗:', e);
      }
    }

    init();
  }, []);

  return null;
}
