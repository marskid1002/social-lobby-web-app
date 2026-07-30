// 測試用 next/server stub：讓 bare node 能載入 route.ts（route.ts top-level 匯入 next/server）。
// 只提供載入期需要的最小介面；scopeForSession / validatePatchShape 皆為純函式、不用到這些。
export class NextRequest {}
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
