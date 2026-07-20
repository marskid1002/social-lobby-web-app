'use client';

import { useEffect, useRef, useState } from 'react';

// 這個 bundle 建置當下的版本（由 next.config.ts 烙入）。本機為 'dev' → 停用偵測。
const BUILD = process.env.NEXT_PUBLIC_BUILD_SHA || '';

// 版本偵測（混合模式）：
// - 平常（使用中）偵測到新版 → 顯示「有新版本，點此更新」橫幅，不打斷。
// - App 從背景切回前景（重新打開）→ 自動更新到最新版。
// - 防迴圈：若已為某版本重載過但仍是舊的（快取太黏），就不再自動重載，改顯示橫幅。
export function VersionWatcher() {
  const [stale, setStale] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (!BUILD || BUILD === 'dev') return; // 本機/未知版本不啟用，避免開發時狂重載
    let cancelled = false;

    async function serverSha(): Promise<string | null> {
      if (busy.current) return null;
      busy.current = true;
      try {
        const r = await fetch('/api/version', { cache: 'no-store' });
        if (!r.ok) return null;
        const j = await r.json();
        return typeof j?.sha === 'string' ? j.sha : null;
      } catch {
        return null;
      } finally {
        busy.current = false;
      }
    }

    function reloadOnce(sha: string) {
      // 防迴圈：同一版本只自動重載一次；若重載後仍是舊的（頑固快取）改顯示橫幅
      try {
        if (sessionStorage.getItem('vw_reloaded_for') === sha) {
          setStale(true);
          return;
        }
        sessionStorage.setItem('vw_reloaded_for', sha);
      } catch {
        /* sessionStorage 不可用時就直接重載一次 */
      }
      window.location.reload();
    }

    async function check(autoReload: boolean) {
      const sha = await serverSha();
      if (cancelled || !sha || sha === 'dev' || sha === BUILD) return;
      // 使用者正在打字（輸入框/文字區）就不自動重載，避免打斷/丟草稿 → 改跳橫幅讓他自己點
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (autoReload && !typing) reloadOnce(sha);
      else setStale(true);
    }

    check(false); // 掛載檢查一次（只提示）

    const onVisible = () => {
      if (document.visibilityState === 'visible') check(true); // 回前景 → 自動更新
    };
    document.addEventListener('visibilitychange', onVisible);

    const iv = window.setInterval(() => check(false), 10 * 60 * 1000); // 長時間開著也會提示

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(iv);
    };
  }, []);

  if (!stale) return null;

  return (
    <button
      onClick={() => window.location.reload()}
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] rounded-full bg-brand-ink text-white text-xs font-bold px-4 py-2 shadow-lg active:scale-95"
    >
      🆕 有新版本，點此更新
    </button>
  );
}
