import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { getCollection, mergeShared } from '@/lib/sync-store';
import { planAcceptMatch } from '@/lib/match-accept';
import { sendWebPushToUsers } from '@/lib/push-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveSession(req);
    if (!auth.ok) return auth.response;
    if (auth.isGuest) {
      return NextResponse.json({ error: 'guest is read-only' }, { status: 403 });
    }

    const body = await req.json().catch(() => null) as { responseId?: unknown } | null;
    if (typeof body?.responseId !== 'string') {
      return NextResponse.json({ error: 'invalid responseId' }, { status: 400 });
    }

    const [requests, responses, invitations] = await Promise.all([
      getCollection('requests'),
      getCollection('responses'),
      getCollection('invitations'),
    ]);
    const result = planAcceptMatch({
      session: auth.session,
      responseId: body.responseId,
      requests,
      responses,
      invitations,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const patch = {
      responses: [result.response],
      invitations: [result.invitation],
      ...(result.update ? { updates: [result.update] } : {}),
    };
    await mergeShared(patch);

    // 只有 server 寫入完成後才發送「聊天室已開啟」通知，避免假成功。
    if (!result.alreadyAccepted) {
      await sendWebPushToUsers(
        [result.partnerUserId],
        '客戶已同意入局！',
        `${auth.account?.nickname ?? '某位客戶'} 已同意，聊天室已開啟`,
        `/inbox?match=${encodeURIComponent(String(result.invitation.id))}`,
      ).catch((error) => {
        console.error('[match accept push]', error instanceof Error ? error.name : 'UnknownError');
      });
    }

    return NextResponse.json({
      ok: true,
      response: result.response,
      invitation: result.invitation,
      update: result.update,
      alreadyAccepted: result.alreadyAccepted,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[match accept]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
