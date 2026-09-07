import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { createEscortWithPhotos, getCollection } from '@/lib/sync-store';
import { matchNewPathname, parseStoredImageUrl, safeUserSegment } from '@/lib/image-upload';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    if (auth.isGuest || auth.session.role !== 'manager' || auth.account?.role !== 'manager') {
      return NextResponse.json({ error: '只有幹部可以新增人員' }, { status: 403 });
    }

    const body = await req.json().catch(() => null) as {
      nickname?: unknown;
      avatarUrl?: unknown;
      photos?: unknown;
    } | null;
    const nickname = typeof body?.nickname === 'string' ? body.nickname.trim().slice(0, 20) : '';
    if (!nickname) return NextResponse.json({ error: '請輸入人員名稱' }, { status: 400 });

    const avatarUrl = typeof body?.avatarUrl === 'string' ? body.avatarUrl.trim() : '';
    const photos = Array.isArray(body?.photos)
      ? [...new Set(body.photos.filter((url): url is string => typeof url === 'string').map((url) => url.trim()).filter(Boolean))]
      : [];
    if (!avatarUrl) return NextResponse.json({ error: '請上傳大頭照' }, { status: 400 });
    if (photos.length === 0) return NextResponse.json({ error: '請至少上傳一張一般照片' }, { status: 400 });

    const owner = safeUserSegment(auth.session.userId);
    const isOwnedUpload = (url: string, kind: 'managed-photo' | 'gallery') => {
      const stored = parseStoredImageUrl(url);
      if (!stored.ok) return false;
      const upload = matchNewPathname(stored.pathname);
      return upload?.owner === owner && upload.kind === kind;
    };
    if (!isOwnedUpload(avatarUrl, 'managed-photo') || photos.some((url) => !isOwnedUpload(url, 'gallery'))) {
      return NextResponse.json({ error: '照片來源無效，請重新上傳' }, { status: 400 });
    }

    const escort = {
      id: `esc-${crypto.randomUUID()}`,
      managerId: auth.session.userId,
      nickname,
      bio: '',
      defaultArea: '信義區',
      createdAt: new Date().toISOString(),
    };
    await createEscortWithPhotos(escort, avatarUrl, photos);
    const escorts = (await getCollection('escorts')).filter((item) => (
      item.managerId === auth.session.userId && item.removed !== true
    ));
    return NextResponse.json({ ok: true, escort, escorts }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[escort create]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: '新增失敗，請稍後再試' }, { status: 500 });
  }
}
