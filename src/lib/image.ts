// 瀏覽器端影像工具：上傳前先縮圖轉 JPEG（相容手機大圖 / iPhone HEIC），再送 /api/upload 存到 Blob。

export async function downscaleToJpegDataUrl(file: File, maxDim = 1280, quality = 0.82): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('image load failed'));
      im.src = objectUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// 上傳聊天照片：縮圖 → /api/upload（存 Blob）→ 回傳圖片網址。失敗時 throw 帶原因的錯誤。
export async function uploadChatImage(file: File): Promise<string> {
  let dataUrl: string;
  try {
    dataUrl = await downscaleToJpegDataUrl(file);
  } catch {
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(file);
    });
  }
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'chat', kind: 'chat', dataUrl }),
  });
  if (!res.ok) {
    let detail = String(res.status);
    try { const j = await res.json(); if (j?.error) detail += ` ${j.error}`; } catch {}
    throw new Error(`上傳失敗(${detail})`);
  }
  const data = await res.json();
  if (!data?.url) throw new Error('上傳失敗：伺服器未回傳網址');
  return data.url as string;
}
