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
