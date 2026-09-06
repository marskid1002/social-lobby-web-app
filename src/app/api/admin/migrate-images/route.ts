import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { getCollection, mergeShared } from '@/lib/sync-store';
import { parseBlobUrl } from '@/lib/image-upload';
import { isR2Configured, putR2Object } from '@/lib/r2-storage';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Item = { id: string; [key: string]: unknown };
const MIGRATED_COLLECTIONS = ['photoOverrides', 'photoGalleries', 'chatMessages', 'momentPosts'] as const;

function safeSecretEqual(left: string | null, right: string | undefined): boolean {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function authorized(req: NextRequest): Promise<boolean> {
  if (safeSecretEqual(req.headers.get('x-admin-secret'), process.env.ADMIN_SECRET)) return true;
  const auth = await requireActiveSession(req);
  return auth.ok && !auth.isGuest && auth.session.role === 'admin' && auth.account?.key === 'A000';
}

function referencedBlobUrls(collections: Item[][]): Array<{ url: string; pathname: string }> {
  const urls = new Set<string>();
  for (const [index, records] of collections.entries()) {
    const key = MIGRATED_COLLECTIONS[index];
    for (const record of records) {
      if ((key === 'photoOverrides' || key === 'chatMessages' || key === 'momentPosts')
          && typeof record.avatarUrl === 'string') urls.add(record.avatarUrl);
      if ((key === 'chatMessages' || key === 'momentPosts') && typeof record.imageUrl === 'string') urls.add(record.imageUrl);
      if (key === 'photoGalleries' && Array.isArray(record.urls)) {
        for (const url of record.urls) if (typeof url === 'string') urls.add(url);
      }
    }
  }
  return [...urls].flatMap((url) => {
    const parsed = parseBlobUrl(url);
    return parsed.ok ? [{ url, pathname: parsed.pathname }] : [];
  }).sort((a, b) => a.pathname.localeCompare(b.pathname));
}

function inferredContentType(pathname: string): string | null {
  if (/\.jpe?g$/i.test(pathname)) return 'image/jpeg';
  if (/\.png$/i.test(pathname)) return 'image/png';
  if (/\.webp$/i.test(pathname)) return 'image/webp';
  return null;
}

async function copyOne(item: { url: string; pathname: string }): Promise<{ oldUrl: string; newUrl: string } | { error: string; pathname: string }> {
  try {
    const source = await fetch(item.url, { redirect: 'error' });
    if (!source.ok) return { error: `source-http-${source.status}`, pathname: item.pathname };
    const declaredLength = Number(source.headers.get('content-length') || 0);
    if (declaredLength > 5 * 1024 * 1024) return { error: 'source-too-large', pathname: item.pathname };
    const bytes = Buffer.from(await source.arrayBuffer());
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) return { error: 'source-size-invalid', pathname: item.pathname };
    const headerType = source.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    const contentType = headerType && ['image/jpeg', 'image/png', 'image/webp'].includes(headerType)
      ? headerType
      : inferredContentType(item.pathname);
    if (!contentType) return { error: 'source-type-invalid', pathname: item.pathname };
    const newUrl = await putR2Object(item.pathname, bytes, contentType);
    return { oldUrl: item.url, newUrl };
  } catch {
    return { error: 'copy-failed', pathname: item.pathname };
  }
}

async function applyReplacements(replacements: Map<string, string>): Promise<number> {
  if (!replacements.size) return 0;
  const [photoOverrides, photoGalleries, chatMessages, momentPosts] = await Promise.all(
    MIGRATED_COLLECTIONS.map((key) => getCollection(key)),
  );
  const replace = (value: unknown): unknown => typeof value === 'string' ? (replacements.get(value) ?? value) : value;
  const changed = (records: Item[], transform: (record: Item) => Item): Item[] => records.flatMap((record) => {
    const next = transform(record);
    return JSON.stringify(next) === JSON.stringify(record) ? [] : [next];
  });
  const patch = {
    photoOverrides: changed(photoOverrides, (record) => ({ ...record, avatarUrl: replace(record.avatarUrl) })),
    photoGalleries: changed(photoGalleries, (record) => ({
      ...record,
      urls: Array.isArray(record.urls) ? record.urls.map(replace) : record.urls,
    })),
    chatMessages: changed(chatMessages, (record) => ({
      ...record,
      avatarUrl: replace(record.avatarUrl),
      imageUrl: replace(record.imageUrl),
    })),
    momentPosts: changed(momentPosts, (record) => ({
      ...record,
      avatarUrl: replace(record.avatarUrl),
      imageUrl: replace(record.imageUrl),
    })),
  };
  await mergeShared(patch);
  return Object.values(patch).reduce((sum, records) => sum + records.length, 0);
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit('admin-image-migration', clientIp(req), 30, 60);
  if (!limited.ok) return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  if (!await authorized(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!isR2Configured()) return NextResponse.json({ error: 'R2 is not configured' }, { status: 503 });

  const body = await req.json().catch(() => ({})) as { cursor?: unknown; batchSize?: unknown };
  const cursor = typeof body.cursor === 'string' ? body.cursor.slice(0, 2048) : '';
  const requestedBatch = Number(body.batchSize ?? 10);
  const batchSize = Number.isFinite(requestedBatch) ? Math.min(Math.max(Math.floor(requestedBatch), 1), 20) : 10;
  const collections = await Promise.all(MIGRATED_COLLECTIONS.map((key) => getCollection(key)));
  const candidates = referencedBlobUrls(collections);
  const remaining = candidates.filter((item) => item.pathname > cursor);
  const batch = remaining.slice(0, batchSize);
  const results = await Promise.all(batch.map(copyOne));
  const successful = results.filter((result): result is { oldUrl: string; newUrl: string } => 'newUrl' in result);
  const failures = results.filter((result): result is { error: string; pathname: string } => 'error' in result);
  const replacements = new Map(successful.map((result) => [result.oldUrl, result.newUrl]));
  const updatedRecords = await applyReplacements(replacements);
  const hasMore = remaining.length > batch.length;

  return NextResponse.json({
    referencedVercelImages: candidates.length,
    attempted: batch.length,
    migrated: successful.length,
    failed: failures.length,
    updatedRecords,
    failures,
    nextCursor: hasMore && batch.length ? batch.at(-1)!.pathname : null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
