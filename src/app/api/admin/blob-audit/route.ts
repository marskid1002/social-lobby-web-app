import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { getCollection, SHARED_KEYS } from '@/lib/sync-store';
import { parseBlobUrl, matchNewPathname, matchLegacyPathname } from '@/lib/image-upload';

/**
 * A000 專用、**完全唯讀**的 Blob 盤點：找出「已無任何資料引用」的孤兒照片。
 *
 * 背景：聊天室過期後 planDataRetention 會刪掉 chatMessages，但 Blob 上的照片檔案不會被刪，
 * 因此累積孤兒。照片是 access:'public'、網址永久有效，所以這同時是隱私問題而非只是空間。
 *
 * **本端點絕對不刪除任何東西**，只回報統計，供決定是否開啟自動清理。
 *
 * 兩個刻意的設計：
 * 1. 用 getCollection 逐集合讀，而非 getShared —— 後者會順帶執行 retention 並刪除 Redis 項目，
 *    那就不是唯讀了。
 * 2. 引用判定用「遞迴掃過每個項目的所有字串值」，而不是列舉已知欄位
 *    （chatMessages.imageUrl / momentPosts.imageUrl / photoOverrides.avatarUrl / photoGalleries.urls…）。
 *    漏掉任何一個欄位都會把使用中的照片誤判為孤兒，寧可保守。
 */

export const dynamic = 'force-dynamic';

const MAX_PAGES = 20; // 每頁 1000，上限 2 萬個檔案；防止意外的無限分頁

type BlobItem = { pathname: string; size: number; uploadedAt: string };

/** 遞迴收集任何一層字串值裡的本站 Blob pathname。 */
function collectBlobPathnames(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') {
    const parsed = parseBlobUrl(value);
    if (parsed.ok) out.add(parsed.pathname);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectBlobPathnames(v, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectBlobPathnames(v, out);
  }
}

/** 從 pathname 取用途分類（新格式有 kind；舊格式歸為 legacy；都不符歸為 unknown）。 */
function kindOf(pathname: string): string {
  const matched = matchNewPathname(pathname);
  if (matched) return matched.kind;
  if (matchLegacyPathname(pathname)) return 'legacy';
  return 'unknown';
}

function tally(items: BlobItem[]) {
  const byKind: Record<string, { count: number; bytes: number }> = {};
  let bytes = 0;
  let oldest: string | null = null;
  for (const item of items) {
    const kind = kindOf(item.pathname);
    byKind[kind] ??= { count: 0, bytes: 0 };
    byKind[kind].count += 1;
    byKind[kind].bytes += item.size;
    bytes += item.size;
    if (!oldest || item.uploadedAt < oldest) oldest = item.uploadedAt;
  }
  return { count: items.length, bytes, byKind, oldestUploadedAt: oldest };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    if (
      auth.isGuest
      || auth.session.role !== 'admin'
      || auth.account?.role !== 'admin'
      || auth.account.key !== 'A000'
    ) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
      return NextResponse.json({ error: 'blob not configured' }, { status: 503 });
    }

    // 1) 列出 Blob 上所有檔案（分頁）
    const { list } = await import('@vercel/blob');
    const all: BlobItem[] = [];
    let cursor: string | undefined;
    let pages = 0;
    let truncated = false;
    do {
      const page = await list({ cursor, limit: 1000 });
      for (const b of page.blobs) {
        all.push({
          pathname: b.pathname,
          size: typeof b.size === 'number' ? b.size : 0,
          uploadedAt: b.uploadedAt instanceof Date
            ? b.uploadedAt.toISOString()
            : String(b.uploadedAt ?? ''),
        });
      }
      cursor = page.cursor;
      pages += 1;
      if (page.hasMore && pages >= MAX_PAGES) { truncated = true; break; }
      if (!page.hasMore) break;
    } while (cursor);

    // 2) 讀所有集合（並行、不觸發 retention），遞迴收集被引用的 pathname
    const collections = await Promise.all(SHARED_KEYS.map((key) => getCollection(key)));
    const referenced = new Set<string>();
    const perCollection: Record<string, number> = {};
    SHARED_KEYS.forEach((key, i) => {
      const before = referenced.size;
      collectBlobPathnames(collections[i], referenced);
      perCollection[key] = referenced.size - before; // 該集合新增的引用數（重複引用只算一次）
    });

    // 3) 比對
    const orphans = all.filter((b) => !referenced.has(b.pathname));
    const missing = [...referenced].filter(
      (p) => !all.some((b) => b.pathname === p),
    ); // 有引用但檔案不存在（破圖）

    return NextResponse.json(
      {
        scannedAt: new Date().toISOString(),
        readOnly: true,
        truncated, // true 表示檔案數超過 MAX_PAGES × 1000，統計不完整
        blob: tally(all),
        referenced: {
          count: referenced.size,
          newByCollection: perCollection,
        },
        orphans: {
          ...tally(orphans),
          sample: orphans
            .slice()
            .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))
            .slice(0, 15),
        },
        missingFiles: { count: missing.length, sample: missing.slice(0, 10) },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[blob audit]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
