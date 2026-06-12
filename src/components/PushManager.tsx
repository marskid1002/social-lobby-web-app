'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppState } from '@/lib/state';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** 註冊 SW 並建立/送出訂閱，綁定到目前使用者。需在已取得通知權限後呼叫。 */
async function registerAndSubscribe(userId: string): Promise<boolean> {
  if (!pushSupported() || !userId) return false;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    // 綁定訂閱到目前使用者（切換身份會把 endpoint 移到新 userId）
    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, subscription: sub }),
    });
    return true;
  } catch (e) {
    console.warn('[push] 訂閱失敗:', e);
    return false;
  }
}

/**
 * 由使用者點擊觸發：請求通知權限並訂閱推播。
 * 必須在點擊事件中呼叫（iOS / 現代瀏覽器要求使用者手勢）。
 */
export async function enablePushNotifications(userId: string): Promise<NotificationPermission> {
  if (!pushSupported()) return 'denied';
  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission === 'granted') {
    await registerAndSubscribe(userId);
  }
  return permission;
}

/** 讀取目前通知權限狀態（granted / denied / default / unsupported）。 */
export function useNotificationPermission() {
  const { state } = useAppState();
  const userId = state.currentUserId;
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    if (!pushSupported()) { setPermission('unsupported'); return; }
    setPermission(Notification.permission);
  }, []);

  const request = useCallback(async () => {
    const p = await enablePushNotifications(userId);
    setPermission(p);
    return p;
  }, [userId]);

  return { permission, request };
}

/**
 * 掛載在 app layout：若使用者「已經」授權過通知，靜默重新註冊訂閱，
 * 並在切換身份時把訂閱重新綁定到目前使用者。不主動跳授權框（交給按鈕）。
 */
export function PushManager() {
  const { state } = useAppState();
  const userId = state.currentUserId;

  useEffect(() => {
    if (!pushSupported()) return;
    if (Notification.permission === 'granted') {
      registerAndSubscribe(userId);
    }
  }, [userId]);

  return null;
}
