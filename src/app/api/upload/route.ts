import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';

export const dynamic = 'force-dynamic';

// dataUrl → Buffer
function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { contentType: m[1], buffer: Buffer.from(m[2], 'base64') };
}

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

    // 上傳：body = { userId, dataUrl }
    const { userId, dataUrl } = body;
    if (!userId || !dataUrl) {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
    }
    // 圖片大小上限（約 2MB 解碼後）：擋過大檔/濫用；前端已先縮圖，正常照片遠低於此
    if (typeof dataUrl === 'string' && dataUrl.length > 2_800_000) {
      return NextResponse.json({ error: '圖片太大，請小於約 2MB' }, { status: 413 });
    }

    // Blob 不可用：正式站直接報錯（dataURL 會被 /api/sync 擋下，塞了也存不進去）；本地開發才回 dataURL 供測試
    if (!blobAvailable) {
      if (isProd) return NextResponse.json({ error: '圖片儲存尚未設定（請在 Vercel 連結 Blob）' }, { status: 503 });
      return NextResponse.json({ url: dataUrl, fallback: true });
    }

    const parsed = dataUrlToBuffer(dataUrl);
    if (!parsed) {
      return NextResponse.json({ error: 'invalid image' }, { status: 400 });
    }

    const ext = parsed.contentType.split('/')[1] ?? 'jpg';
    try {
      const { put } = await import('@vercel/blob');
      const blob = await put(`avatars/${userId}-${Date.now()}.${ext}`, parsed.buffer, {
        access: 'public',
        contentType: parsed.contentType,
      });
      return NextResponse.json({ url: blob.url });
    } catch (e) {
      // Blob 上傳失敗（例如缺少 BLOB_READ_WRITE_TOKEN / OIDC 權限）
      console.error('[upload] blob put failed:', e);
      // 正式站報錯（dataURL 會被 /api/sync 擋下，不做無效退回）；本地才退回 dataURL
      if (isProd) return NextResponse.json({ error: '圖片上傳失敗，請確認 Vercel Blob 設定' }, { status: 502 });
      return NextResponse.json({ url: dataUrl, fallback: true, blobError: String(e) });
    }
  } catch (e) {
    console.error('[upload]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
