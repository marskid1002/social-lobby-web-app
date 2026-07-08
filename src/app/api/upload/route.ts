import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// dataUrl → Buffer
function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { contentType: m[1], buffer: Buffer.from(m[2], 'base64') };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

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

    // Blob 不可用（本地開發無設定）→ 直接回傳 data URL（存進 override，本地可測）
    if (!blobAvailable) {
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
      // Blob 上傳失敗（例如 OIDC 權限）→ 退回 data URL，不阻斷功能
      console.error('[upload] blob put failed, fallback to dataUrl:', e);
      return NextResponse.json({ url: dataUrl, fallback: true, blobError: String(e) });
    }
  } catch (e) {
    console.error('[upload]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
