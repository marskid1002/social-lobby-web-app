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
