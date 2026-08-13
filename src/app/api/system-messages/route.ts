import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { listSystemMessagesForUser, markSystemMessageRead } from '@/lib/system-message-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireActiveSession(req);
  if (!auth.ok) return auth.response;
  if (auth.isGuest) return NextResponse.json({ messages: [], unreadCount: 0 });
  const messages = await listSystemMessagesForUser(auth.session.userId);
  return NextResponse.json({
    messages: messages.map(({ senderId: _senderId, pushSent: _pushSent, pushTotal: _pushTotal, pushSkipped: _pushSkipped, ...message }) => message),
    unreadCount: messages.filter((message) => !message.readAt).length,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireActiveSession(req);
  if (!auth.ok) return auth.response;
  if (auth.isGuest) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id || id.length > 100) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const message = await markSystemMessageRead(auth.session.userId, id);
  if (!message) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, readAt: message.readAt }, { headers: { 'Cache-Control': 'no-store' } });
}
