// 測試用 @vercel/blob stub：讓 /api/upload 的動態 import('@vercel/blob') 在測試中不連真實 Blob。
// 記錄 put/del 呼叫到 globalThis，供斷言 pathname / contentType；put 回傳假的 blob URL。
export async function put(pathname, body, options) {
  globalThis.__BLOB_PUT_CALLS__ = globalThis.__BLOB_PUT_CALLS__ || [];
  globalThis.__BLOB_PUT_CALLS__.push({
    pathname,
    contentType: options?.contentType,
    access: options?.access,
    bodyLen: body && typeof body.length === 'number' ? body.length : undefined,
  });
  return { url: `https://blob.vercel-storage.com/${pathname}` };
}
export async function del(url) {
  globalThis.__BLOB_DEL_CALLS__ = globalThis.__BLOB_DEL_CALLS__ || [];
  globalThis.__BLOB_DEL_CALLS__.push(url);
}

// head：預設由 URL 推導權威 pathname（模擬「存在且一致」）。測試可設 globalThis.__BLOB_HEAD_OVERRIDE__
// 為 (url) => result 或 throw 來模擬「找不到 / pathname 不一致 / provider 錯誤」。
export async function head(url) {
  globalThis.__BLOB_HEAD_CALLS__ = globalThis.__BLOB_HEAD_CALLS__ || [];
  globalThis.__BLOB_HEAD_CALLS__.push(url);
  if (typeof globalThis.__BLOB_HEAD_OVERRIDE__ === 'function') return globalThis.__BLOB_HEAD_OVERRIDE__(url);
  const u = new URL(url);
  return { url, pathname: u.pathname.replace(/^\//, ''), contentType: 'image/jpeg', size: 10 };
}
