import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireActiveSession } from '@/lib/active-session';
import { parseAndValidateImageDataUrl, buildUploadPathname, parseBlobUrl, authorizeBlobDeletion } from '@/lib/image-upload';
import { getCollection } from '@/lib/sync-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // F：需登入且帳號仍有效（含登入後被停用/刪除者），在解析 body 與任何 Blob 上傳/刪除之前擋下。
    // 訪客唯讀不可上傳/刪除。幹部管理小姐照片、一般客戶在聊天室傳照片都會用到，故放寬給非訪客。
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    if (auth.isGuest) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const session = auth.session;

    const body = await req.json();

    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    // Blob 是否可用：OIDC 連結會注入 BLOB_STORE_ID；本地或明確 token 則有 BLOB_READ_WRITE_TOKEN
    const blobAvailable = !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

    // 刪除既有 Blob。刪除仍限 manager（維持既有邊界，不擴權）；H2：所有權必須在 del() 之前完成。
    if (body?.action === 'delete') {
      if (session.role !== 'manager') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      const url: unknown = body?.url;
      if (typeof url !== 'string' || !url) return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
      // 無 Blob store（本地/未設定）→ 無事可刪，維持既有冪等行為（不 del、不改共享狀態）
      if (!blobAvailable) return NextResponse.json({ ok: true });

      // 嚴格驗證 URL / host / pathname（不用 includes、不信任 client 任何欄位）
      const parsedUrl = parseBlobUrl(url);
      if (!parsedUrl.ok) return NextResponse.json({ error: 'invalid url' }, { status: 400 });

      const { head, del } = await import('@vercel/blob');
      // 以 provider head() 取得權威 pathname；找不到 → 冪等（無 del）；其他 provider 錯誤 → 一般化 500
      let authoritativePathname: string | null;
      try {
        authoritativePathname = (await head(url)).pathname;
      } catch (e) {
        if ((e as { name?: string })?.name === 'BlobNotFoundError') authoritativePathname = null;
        else { console.error('[upload] blob head failed'); return NextResponse.json({ error: 'server error' }, { status: 500 }); }
      }

      // 舊格式所有權需 server 端 escorts / 照片紀錄（唯讀）；不信任 request body 的 managerId/escortId
      const [escorts, photoOverrides, photoGalleries] = await Promise.all([
        getCollection('escorts'),
        getCollection('photoOverrides'),
        getCollection('photoGalleries'),
      ]);
      const decision = authorizeBlobDeletion({
        url,
        authoritativePathname: authoritativePathname ?? parsedUrl.pathname, // 不存在時以 URL pathname 判斷所有權（仍 fail-closed）
        urlPathname: parsedUrl.pathname,
        sessionUserId: session.userId,
        escorts: escorts as { id?: string; managerId?: string; removed?: boolean }[],
        photoOverrides: photoOverrides as { id?: string; avatarUrl?: string }[],
        photoGalleries: photoGalleries as { id?: string; urls?: string[] }[],
      });
      if (!decision.ok) return NextResponse.json({ error: 'forbidden' }, { status: decision.status });

      // 通過所有權才可能 del；Blob 本就不存在則冪等成功、不 del
      if (authoritativePathname === null) return NextResponse.json({ ok: true });
      await del(url);
      return NextResponse.json({ ok: true });
    }

    // 上傳：body = { userId?, dataUrl, kind? }
    // 注意：client 傳的 userId 只為相容保留在 payload，server「不」用它決定 Blob 路徑或授權（H1）。
    const dataUrl = body?.dataUrl;
    const kind = typeof body?.kind === 'string' ? body.kind : undefined;
    if (typeof dataUrl !== 'string' || !dataUrl) {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
    }

    // H1：嚴格驗證「格式 + MIME 白名單 + base64 canonical + decoded 大小 + magic bytes 一致」。
    // 必須在任何 Blob put 或 dev fallback 回傳「之前」完成，避免非法內容繞過驗證。
    const parsed = parseAndValidateImageDataUrl(dataUrl);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

    // Blob 不可用：正式站 fail-closed 503；本地開發才回 dataURL 供測試——但已通過上面完整驗證。
    if (!blobAvailable) {
      if (isProd) return NextResponse.json({ error: '圖片儲存尚未設定（請在 Vercel 連結 Blob）' }, { status: 503 });
      return NextResponse.json({ url: dataUrl, fallback: true });
    }

    // pathname 由 server 產生：身分只用 session.userId（最小正規化）、kind 走白名單、檔名用 randomUUID、
    // 副檔名用驗證後 MIME 的固定 mapping；contentType 也用驗證後 MIME。
    const pathname = buildUploadPathname(session.userId, kind, parsed.ext, randomUUID());
    try {
      const { put } = await import('@vercel/blob');
      const blob = await put(pathname, parsed.buffer, {
        access: 'public',
        contentType: parsed.mime,
      });
      return NextResponse.json({ url: blob.url });
    } catch {
      // Blob 上傳失敗：只記一般訊息，不輸出 token / buffer / base64 / 完整 provider error
      console.error('[upload] blob put failed');
      // 正式站報錯（dataURL 會被 /api/sync 擋下，不做無效退回）；本地才退回已驗證的 dataURL
      if (isProd) return NextResponse.json({ error: '圖片上傳失敗，請確認 Vercel Blob 設定' }, { status: 502 });
      return NextResponse.json({ url: dataUrl, fallback: true });
    }
  } catch {
    console.error('[upload] request error');
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
