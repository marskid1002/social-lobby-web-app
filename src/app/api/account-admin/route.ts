import { NextRequest, NextResponse } from 'next/server';
import {
  bumpAccountSessionVersion,
  createManagerAccount,
  getAccount,
  listAccounts,
  regenerateManagerActivation,
  setAccountDisabled,
  setManagerArchived,
  updateManagerNickname,
  type Account,
} from '@/lib/auth-store';
import { requireActiveSession } from '@/lib/active-session';
import { recordAdminAudit } from '@/lib/admin-audit-store';
import { getCollection, mergeShared } from '@/lib/sync-store';
import { removeDevicesForUser } from '@/lib/device-store';
import { removeSubscriptionsForUser } from '@/lib/push-store';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
const READ_ONLY_MANAGER_KEYS = new Set(Array.from({ length: 10 }, (_, index) => `A${String(index + 1).padStart(3, '0')}`));

async function requireA888(req: NextRequest) {
  const auth = await requireActiveSession(req);
  if (!auth.ok) return auth;
  if (auth.session.role !== 'account_admin' || auth.account?.role !== 'account_admin' || auth.account.key !== 'A888') {
    return { ok: false as const, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return auth;
}

async function requireAccountConsole(req: NextRequest) {
  const auth = await requireActiveSession(req);
  if (!auth.ok) return auth;
  const isAdmin = auth.session.role === 'account_admin'
    && auth.account?.role === 'account_admin'
    && auth.account.key === 'A888';
  const isViewer = auth.session.role === 'account_viewer'
    && auth.account?.role === 'account_viewer'
    && auth.account.key === 'A777';
  if (!isAdmin && !isViewer) {
    return { ok: false as const, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return auth;
}

function safeManager(account: Account) {
  return {
    key: account.key,
    nickname: account.nickname,
    hasPassword: Boolean(account.hash),
    disabled: Boolean(account.disabled),
    archived: Boolean(account.archived),
    mustChangeNickname: Boolean(account.mustChangeNickname),
    createdAt: account.createdAt,
  };
}

async function audit(actor: string, action: string, target?: string, detail?: string) {
  await recordAdminAudit({ adminUserId: actor, action: `account_admin.${action}`, target, detail });
}

export async function GET(req: NextRequest) {
  const auth = await requireAccountConsole(req);
  if (!auth.ok) return auth.response;
  const accountKey = auth.account?.key;
  if (!accountKey) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const readOnly = accountKey === 'A777';
  const managers = (await listAccounts())
    .filter((account) => account.role === 'manager' && (!readOnly || READ_ONLY_MANAGER_KEYS.has(account.key)))
    .map(safeManager)
    .sort((a, b) => a.key.localeCompare(b.key));
  return NextResponse.json({ managers, readOnly, account: accountKey }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = await requireA888(req);
  if (!auth.ok) return auth.response;
  const limited = await rateLimit('account-admin', `${auth.session.userId}:${clientIp(req)}`, 60, 60);
  if (!limited.ok) return NextResponse.json({ error: '操作過於頻繁，請稍後再試' }, { status: 429 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  const action = typeof body.action === 'string' ? body.action : '';
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';

  if (action === 'create') {
    if (nickname.length < 2 || nickname.length > 60) {
      return NextResponse.json({ error: '名稱需為 2–60 字' }, { status: 400 });
    }
    const created = await createManagerAccount(nickname);
    await mergeShared({ registeredUsers: [{
      id: created.account.userId,
      lineUserId: created.account.userId,
      nickname: created.account.nickname,
      avatarUrl: '',
      cardImageUrl: '',
      bio: '',
      defaultArea: '台北市',
      interests: [],
      tier: 'vip',
      role: 'manager',
      credits: 0,
      monthlyRequestsLeft: 0,
      lineOAFollowed: false,
      createdAt: created.account.createdAt,
    }] });
    await audit(auth.session.userId, action, created.account.key);
    return NextResponse.json({ ok: true, account: created.account.key, activationCode: created.activationCode });
  }

  const key = typeof body.account === 'string' ? body.account.trim().toUpperCase() : '';
  const target = await getAccount(key);
  if (!target || target.role !== 'manager') {
    return NextResponse.json({ error: '只能管理幹部帳號' }, { status: 400 });
  }

  if (action === 'edit') {
    if (nickname.length < 2 || nickname.length > 60) return NextResponse.json({ error: '名稱需為 2–60 字' }, { status: 400 });
    const updated = await updateManagerNickname(key, nickname);
    if (!updated) return NextResponse.json({ error: '更新失敗' }, { status: 400 });
    const profiles = await getCollection('registeredUsers');
    const profile = profiles.find((item) => item.id === updated.userId);
    if (profile) await mergeShared({ registeredUsers: [{ ...profile, nickname: updated.nickname }] });
    await audit(auth.session.userId, action, key);
    return NextResponse.json({ ok: true });
  }

  if (action === 'activate') {
    const activationCode = await regenerateManagerActivation(key);
    if (!activationCode) return NextResponse.json({ error: '無法產生啟用碼' }, { status: 400 });
    await Promise.all([removeDevicesForUser(target.userId), removeSubscriptionsForUser(target.userId)]);
    await audit(auth.session.userId, action, key, '一次性啟用碼（使用或重發後失效）');
    return NextResponse.json({ ok: true, account: key, activationCode });
  }

  if (action === 'disable' || action === 'enable') {
    const ok = await setAccountDisabled(key, action === 'disable');
    if (ok && action === 'disable') await Promise.all([removeDevicesForUser(target.userId), removeSubscriptionsForUser(target.userId)]);
    if (ok) await audit(auth.session.userId, action, key);
    return NextResponse.json({ ok });
  }

  if (action === 'archive' || action === 'unarchive') {
    const ok = await setManagerArchived(key, action === 'archive');
    if (ok && action === 'archive') await Promise.all([removeDevicesForUser(target.userId), removeSubscriptionsForUser(target.userId)]);
    if (ok) await audit(auth.session.userId, action, key);
    return NextResponse.json({ ok });
  }

  if (action === 'logout') {
    const updated = await bumpAccountSessionVersion(key);
    if (!updated) return NextResponse.json({ error: '登出失敗' }, { status: 400 });
    const count = await removeDevicesForUser(updated.userId);
    await removeSubscriptionsForUser(updated.userId);
    await audit(auth.session.userId, action, key, `count=${count}`);
    return NextResponse.json({ ok: true, count });
  }

  return NextResponse.json({ error: '不允許的操作' }, { status: 400 });
}
