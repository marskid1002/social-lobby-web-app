import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';

export const dynamic = 'force-dynamic';

// dataUrl → Buffer
function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { contentType: m[1], buffer: Buffer.from(m[2], 'base64') };
}

export async function POST(req: NextRequest) {
  try {
    // 僅限登入的幹部（管理小姐照片）
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (session.role !== 'manager') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const body = await req.json();

    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    // Blob 是否可用：OIDC 連結會注入 BLOB_STORE_ID；本地或明確 token 則有 BLOB_READ_WRITE_TOKEN
    const blobAvailable = !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

    // 刪除既有 Blob（best-effort，只刪 vercel blob URL）
    if (body?.action === 'delete') {
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
