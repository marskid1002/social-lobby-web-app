// 測試用 next/server stub：讓 bare node 能載入 route.ts（route.ts top-level 匯入 next/server）。
// 只提供載入期需要的最小介面；scopeForSession / validatePatchShape 皆為純函式、不用到這些。
export class NextRequest {}

// Next 的 after()：把工作排到「回應送出後」執行（用於診斷記錄與推播，不阻塞回應）。
// 測試環境沒有回應生命週期，直接立即執行，讓行為最接近改動前的同步版本；
// callback 內容本身已各自 .catch，這裡再包一層以免測試被非主流程的錯誤中斷。
export function after(callback) {
  try {
    const result = typeof callback === 'function' ? callback() : undefined;
    if (result && typeof result.then === 'function') result.catch(() => {});
  } catch {
    // 忽略：after 的內容是診斷與推播，不影響被測的主流程
  }
}
export const NextResponse = {
  json(body, init) {
    return {
      body,
      init,
      status: (init && init.status) || 200,
      headers: new Headers(init?.headers),
    };
  },
};
