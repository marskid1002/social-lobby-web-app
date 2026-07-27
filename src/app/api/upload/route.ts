import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireActiveSession } from '@/lib/active-session';
import { parseAndValidateImageDataUrl, buildUploadPathname } from '@/lib/image-upload';

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

    // 刪除既有 Blob（best-effort，只刪 vercel blob URL）；刪除仍限幹部，避免客戶亂刪
    if (body?.action === 'delete') {
      if (session.role !== 'manager') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      const url: string | undefined = body.url;
      if (url && /blob\.vercel-storage\.com/.test(url) && blobAvailable) {
        const { del } = await import('@vercel/blob');
        await del(url).catch(() => {});
      }
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
