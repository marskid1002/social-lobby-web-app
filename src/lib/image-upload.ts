/**
 * H1：圖片上傳安全（純函式，供 /api/upload 與單元測試共用；不含任何 I/O、不寫 log）。
 *
 * 只接受 jpeg / png / webp，且「宣告 MIME 必須與實際 magic bytes 一致」；副檔名由 server 決定；
 * Blob pathname 由 server 產生（session.userId 正規化 + 白名單 kind + randomUUID），不吃 client 值。
 */

// ── 允許的圖片格式（宣告 MIME → 伺服器決定的副檔名）────────────────────────────
export const ALLOWED_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export type AllowedMime = keyof typeof ALLOWED_MIME;

// ── Decoded bytes 上限 ───────────────────────────────────────────────────────
// 這是「解碼後實際位元組」上限（非 Data URL 字串長度）。取 2MiB：
//  - 前端上傳一律先經 Canvas 縮到 1280px、JPEG quality 0.82（見 lib/image.ts），一般成品約數百 KB，
//    2MiB 對正常 JPEG/PNG/WEBP 有充裕餘裕、不會擋掉合法照片；
//  - base64 後約 2.67MB（見下 MAX_ENCODED_B64_LEN），加上 JSON 包裝仍遠低於 Vercel 請求 body（~4.5MB）上限。
// 只用來擋病態/惡意的超大內容，不任意放大。
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2,097,152

// base64 編碼長度上限：N bytes 的 canonical base64 長度 = 4 * ceil(N/3)（含 padding）。
// 以此為「decode 前」的前置上限，避免先配置超大 Buffer；正好等於上限的圖片仍可通過。
export const MAX_ENCODED_B64_LEN = 4 * Math.ceil(MAX_IMAGE_BYTES / 3); // 2,796,204

// ── pathname kind 白名單 ─────────────────────────────────────────────────────
export const KIND_WHITELIST = ['chat', 'avatar', 'gallery', 'managed-photo', 'image'] as const;
export type UploadKind = (typeof KIND_WHITELIST)[number];
export const DEFAULT_KIND: UploadKind = 'image';

// 嚴格 Data URL：只允許 data:<allowed-mime>;base64,<canonical-base64>
// 不允許 charset / 其他 parameter / 空白 / 非 base64 字元；'=' 只能出現在結尾且至多 2 個。
const DATA_URL_RE = /^data:(image\/jpeg|image\/png|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/;

export type ImageValidation =
  | { ok: true; mime: AllowedMime; ext: string; buffer: Buffer }
  | { ok: false; status: 400 | 413; error: string };

// magic bytes 與宣告 MIME 一致性檢查
function magicMatches(mime: AllowedMime, b: Buffer): boolean {
  if (mime === 'image/jpeg') {
    return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  }
  if (mime === 'image/png') {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (b.length < sig.length) return false;
    for (let i = 0; i < sig.length; i++) if (b[i] !== sig[i]) return false;
    return true;
  }
  // image/webp：bytes 0-3 = 'RIFF'、bytes 8-11 = 'WEBP'，且至少 12 bytes
  if (b.length < 12) return false;
  const riff = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46; // R I F F
  const webp = b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50; // W E B P
  return riff && webp;
}

/**
 * 解析並驗證 image Data URL。錯誤訊息一般化，不含 dataUrl/base64/圖片內容。
 * 順序：字串 → 嚴格格式(含 MIME 白名單) → encoded 長度上限 → base64 canonical → decode
 *      → 空 buffer → decoded bytes 上限 → magic bytes 一致性。
 */
export function parseAndValidateImageDataUrl(dataUrl: unknown): ImageValidation {
  if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
    return { ok: false, status: 400, error: 'invalid image data' };
  }
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) return { ok: false, status: 400, error: 'invalid image data' }; // 非法格式 / 非允許 MIME / 非 base64
  const mime = m[1] as AllowedMime;
  const b64 = m[2];

  // decode 前先擋病態超長 payload（避免配置超大 Buffer）
  if (b64.length > MAX_ENCODED_B64_LEN) return { ok: false, status: 413, error: 'image too large' };

  const buffer = Buffer.from(b64, 'base64');
  // canonical 檢查：Buffer.from 對長度不對/非 canonical base64 會靜默截斷，故用「重新編碼比對」把關，
  // 避免垃圾/截斷內容被靜默接受（re-encode 為 canonical padded base64）。
  if (buffer.toString('base64') !== b64) return { ok: false, status: 400, error: 'invalid image data' };
  if (buffer.length === 0) return { ok: false, status: 400, error: 'invalid image data' };
  if (buffer.length > MAX_IMAGE_BYTES) return { ok: false, status: 413, error: 'image too large' };
  if (!magicMatches(mime, buffer)) return { ok: false, status: 400, error: 'image content does not match declared type' };

  return { ok: true, mime, ext: ALLOWED_MIME[mime], buffer };
}

// session.userId 最小 pathname 正規化：只留英數/底線/連字號；空則退回 'user'（不得產生空路徑段）。
export function safeUserSegment(userId: unknown): string {
  const cleaned = String(userId ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  return cleaned.length ? cleaned : 'user';
}

// kind 只能來自白名單；缺失/未知/含 '/' 或 '..' 一律正規化為安全預設 'image'。
export function safeKind(kind: unknown): UploadKind {
  return (KIND_WHITELIST as readonly string[]).includes(kind as string) ? (kind as UploadKind) : DEFAULT_KIND;
}

// 由 server 產生 Blob pathname：uploads/<safe-session-user-id>/<kind>/<uuid>.<ext>
// 身分只用 session.userId（呼叫端傳入）；client body.userId 不得進來。uuid 由呼叫端以 crypto.randomUUID() 提供。
export function buildUploadPathname(sessionUserId: string, kind: unknown, ext: string, uuid: string): string {
  return `uploads/${safeUserSegment(sessionUserId)}/${safeKind(kind)}/${uuid}.${ext}`;
}

// ── H2：Blob 刪除所有權 ───────────────────────────────────────────────────────

// 只接受真正的 Vercel Blob public host：<storeId>.public.blob.vercel-storage.com（不得用寬鬆 includes）。
const VERCEL_BLOB_HOST_RE = /^[a-z0-9][a-z0-9-]*\.public\.blob\.vercel-storage\.com$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// 嚴格解析並驗證 Blob URL；回傳 pathname（去前導斜線、未做 naive decode）。任何可疑輸入 → ok:false（呼叫端回 400）。
export function parseBlobUrl(rawUrl: unknown): { ok: true; pathname: string } | { ok: false } {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return { ok: false };
  // 先掃「原始字串」：new URL 會把 ../、./ 正規化掉（明文與 %2e 皆然），故必須在解析前攔截，
  // 才能真正拒絕遍歷/編碼技巧；同時拒 encoded slash/backslash 與雙重編碼（%25）。
  if (/%2e|%2f|%5c|%25/i.test(rawUrl)) return { ok: false };
  if (rawUrl.includes('\\')) return { ok: false };
  if (/(^|\/)\.\.?(\/|$)/.test(rawUrl)) return { ok: false }; // 明文 . 或 .. 路徑段
  let u: URL;
  try { u = new URL(rawUrl); } catch { return { ok: false }; }
  if (u.protocol !== 'https:') return { ok: false };           // 只接受 HTTPS
  if (u.username || u.password) return { ok: false };          // 拒 userinfo host 偽造
  if (u.port) return { ok: false };
  if (!VERCEL_BLOB_HOST_RE.test(u.hostname)) return { ok: false }; // 精確 host（拒 suffix 偽造/子網域碰撞）
  const pathname = u.pathname.replace(/^\//, '');
  if (!pathname) return { ok: false };
  for (const seg of pathname.split('/')) {
    if (seg === '' || seg === '.' || seg === '..') return { ok: false }; // 空/./.. segment（雙重保險）
  }
  return { ok: true, pathname };
}

// 新（H1）格式：uploads/<owner>/<kind>/<uuid>.<ext>；kind 須白名單、uuid 須 v4、ext 須 jpg/png/webp。
export function matchNewPathname(pathname: string): { owner: string; kind: UploadKind; uuid: string; ext: string } | null {
  const segs = pathname.split('/');
  if (segs.length !== 4) return null;
  const [root, owner, kind, file] = segs;
  if (root !== 'uploads' || !owner) return null;
  if (!(KIND_WHITELIST as readonly string[]).includes(kind)) return null;
  const m = /^([0-9a-f-]+)\.(jpg|png|webp)$/.exec(file);
  if (!m || !UUID_RE.test(m[1])) return null;
  return { owner, kind: kind as UploadKind, uuid: m[1], ext: m[2] };
}

// 舊格式：avatars/<owner>-<timestamp>.<ext>（H1 之前，owner 為當時 client 傳入的 userId/girlId）。
export function matchLegacyPathname(pathname: string): { owner: string; ext: string } | null {
  const m = /^avatars\/(.+)-\d+\.(jpg|jpeg|png|webp)$/.exec(pathname);
  if (!m || !m[1]) return null;
  return { owner: m[1], ext: m[2] };
}

// 純函式：判斷此 manager（sessionUserId）是否可刪除該 Blob。del 前必呼叫；不呼叫任何 I/O。
// - authoritativePathname：head() 回傳的權威 pathname；urlPathname：由 URL 解析出的 pathname。
// - escorts/photoOverrides/photoGalleries：server 端既有資料（呼叫端讀入，不信任 client）。
export function authorizeBlobDeletion(input: {
  url: string;
  authoritativePathname: string;
  urlPathname: string;
  sessionUserId: string;
  escorts: { id?: string; managerId?: string; removed?: boolean }[];
  photoOverrides: { id?: string; avatarUrl?: string }[];
  photoGalleries: { id?: string; urls?: string[] }[];
}): { ok: true } | { ok: false; status: 403 } {
  const { url, authoritativePathname, urlPathname, sessionUserId } = input;
  // provider 權威 pathname 與 URL pathname 不一致 → fail closed
  if (authoritativePathname !== urlPathname) return { ok: false, status: 403 };
  const path = authoritativePathname;
  const meSeg = safeUserSegment(sessionUserId);

  // 新格式：owner segment 必須「精確等於」safeUserSegment(session.userId)（不得子字串碰撞）
  const nu = matchNewPathname(path);
  if (nu) return nu.owner === meSeg ? { ok: true } : { ok: false, status: 403 };

  // 舊格式：owner 精確等於 session.userId 或「本人管理的 escort id」，且 URL 須確實在該 owner 的照片紀錄
  const lg = matchLegacyPathname(path);
  if (lg) {
    const managedEscortIds = new Set(
      (input.escorts ?? [])
        .filter((e) => e && e.managerId === sessionUserId && !e.removed && typeof e.id === 'string')
        .map((e) => e.id as string),
    );
    const ownerIsMine = lg.owner === sessionUserId || managedEscortIds.has(lg.owner);
    if (!ownerIsMine) return { ok: false, status: 403 };
    const inOverride = (input.photoOverrides ?? []).some((p) => p && p.id === lg.owner && p.avatarUrl === url);
    const inGallery = (input.photoGalleries ?? []).some(
      (g) => g && g.id === lg.owner && Array.isArray(g.urls) && g.urls.includes(url),
    );
    return inOverride || inGallery ? { ok: true } : { ok: false, status: 403 };
  }

  // 未知格式 → 拒絕
  return { ok: false, status: 403 };
}
