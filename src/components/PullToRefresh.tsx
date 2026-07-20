'use client';

import { useEffect, useRef, useState } from 'react';

// 下拉刷新：專為「加到主畫面」的獨立模式(standalone)設計——那個模式沒有網址列/重新整理鈕，
// 使用者被困在裡面無法刷新。一般瀏覽器分頁有自己的下拉/重新整理，故此手勢只在 standalone 啟用，避免衝突。
export function PullToRefresh() {
  const barRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!standalone) return; // 只在獨立 App 模式啟用

    const THRESHOLD = 70; // 拉超過這距離放手 → 刷新
    let startY = 0;
    let dist = 0;
    let active = false; // 起手時是否位於可下拉狀態（捲動容器在頂端）
    let pulling = false; // 已進入下拉手勢
    let busy = false; // 刷新中

    const setBar = (translateY: number, opacity: number) => {
      const bar = barRef.current;
      if (!bar) return;
      bar.style.transform = `translate(-50%, ${translateY}px)`;
      bar.style.opacity = String(opacity);
    };

    // 由觸控點往上找最近的捲動容器，判斷它是否在最頂（處理內層 overflow-y 捲動區，避免誤觸）
    const atTop = (target: EventTarget | null): boolean => {
      let node = target as HTMLElement | null;
      while (node && node instanceof HTMLElement) {
        const s = getComputedStyle(node);
        if (/(auto|scroll)/.test(s.overflowY) && node.scrollHeight > node.clientHeight + 1) {
          return node.scrollTop <= 0;
        }
        node = node.parentElement;
      }
      return (window.scrollY || 0) <= 0;
    };

    const onStart = (e: TouchEvent) => {
      if (busy || e.touches.length !== 1) return;
      // 正在打字（輸入框聚焦、鍵盤開著）就不啟用下拉，避免不小心重載丟掉草稿
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      active = !typing && atTop(e.target);
      startY = e.touches[0].clientY;
      pulling = false;
      dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!active || busy) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) {
        if (pulling) { pulling = false; setBar(-60, 0); }
        return;
      }
      if (!pulling && dy > 10) pulling = true; // 小 deadzone，避免和點擊/微小移動衝突
      if (pulling) {
        e.preventDefault(); // 擋掉原生橡皮筋，改由我們的下拉
        dist = dy * 0.5; // 阻尼
        setBar(Math.min(dist, 90) - 10, Math.min(1, dist / THRESHOLD));
      }
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      if (pulling && dist >= THRESHOLD) {
        busy = true;
        setRefreshing(true);
        setBar(24, 1);
        window.setTimeout(() => window.location.reload(), 350);
      } else {
        const bar = barRef.current;
        if (bar) {
          bar.style.transition = 'transform .2s, opacity .2s';
          setBar(-60, 0);
          window.setTimeout(() => { if (bar) bar.style.transition = ''; }, 220);
        }
      }
      pulling = false;
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return (
    <div
      ref={barRef}
      style={{ transform: 'translate(-50%, -60px)', opacity: 0 }}
      className="fixed top-2 left-1/2 z-[80] pointer-events-none"
      aria-hidden
    >
      <div className="w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center">
        {refreshing ? (
          <div className="w-4 h-4 rounded-full border-2 border-brand-lavender border-t-brand-sky animate-spin" />
        ) : (
          <span className="text-brand-sky text-lg leading-none">↓</span>
        )}
      </div>
    </div>
  );
}
