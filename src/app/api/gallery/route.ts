import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { getCollection, updatePhotoGallery } from '@/lib/sync-store';
import { matchNewPathname, parseBlobUrl, safeUserSegment } from '@/lib/image-upload';

export const dynamic = 'force-dynamic';

const MAX_BATCH_SIZE = 50;

function cleanUrls(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_BATCH_SIZE) return null;
  const urls = value.filter((url): url is string => typeof url === 'string' && url.length > 0 && url.length <= 2048);
  return urls.length === value.length ? [...new Set(urls)] : null;
}

function isManagerOwnedUpload(url: string, managerId: string): boolean {
  const parsed = parseBlobUrl(url);
  if (!parsed.ok) return false;
  const path = matchNewPathname(parsed.pathname);
  return path?.owner === safeUserSegment(managerId);
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    if (auth.isGuest || auth.session.role !== 'manager') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const escortId = typeof body?.escortId === 'string' ? body.escortId : '';
    const append = cleanUrls(body?.append ?? []);
    const remove = cleanUrls(body?.remove ?? []);
    if (!escortId || !append || !remove || (append.length === 0 && remove.length === 0)) {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
    }

    const escorts = await getCollection('escorts');
    const ownsEscort = escorts.some((escort) => (
      escort.id === escortId
      && escort.managerId === auth.session.userId
      && escort.removed !== true
    ));
    if (!ownsEscort) {
      return NextResponse.json({ error: 'escort ownership not found' }, { status: 403 });
    }
    if (append.some((url) => !isManagerOwnedUpload(url, auth.session.userId))) {
      return NextResponse.json({ error: 'invalid uploaded image' }, { status: 400 });
    }

    const gallery = await updatePhotoGallery(escortId, { append, remove });
    return NextResponse.json({ gallery });
  } catch (error) {
    console.error('[gallery PATCH]', error);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
