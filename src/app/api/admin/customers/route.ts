import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSession } from '@/lib/active-session';
import { createManagedCustomer } from '@/lib/auth-store';
import { normalizeCustomerLogin } from '@/lib/customer-login';
import { passwordRuleError } from '@/lib/password-policy';
import { mergeShared } from '@/lib/sync-store';
import { recordAdminAudit } from '@/lib/admin-audit-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireActiveSession(req);
  if (!auth.ok) return auth.response;
  if (auth.isGuest || auth.session.role !== 'admin' || auth.account?.role !== 'admin' || auth.account.key !== 'A000') {
    return NextResponse.json({ error: '只有 A000 管理員可以新增用戶' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.account !== 'string' || typeof body.password !== 'string' || typeof body.nickname !== 'string') {
    return NextResponse.json({ error: '請填寫帳號、密碼與暱稱' }, { status: 400 });
  }
  const key = normalizeCustomerLogin(body.account);
  const nickname = body.nickname.trim();
  if (!key) return NextResponse.json({ error: '帳號需以英文字母開頭，4～32 碼英數字、底線或連字號；A 加純數字保留給管理帳號' }, { status: 400 });
  if (!nickname || nickname.length > 60) return NextResponse.json({ error: '暱稱需為 1～60 字' }, { status: 400 });
  const passwordError = passwordRuleError(body.password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
  try {
    const account = await createManagedCustomer(key, body.password, nickname);
    if (!account) return NextResponse.json({ error: '此帳號已存在，請換一個帳號' }, { status: 409 });
    await mergeShared({ registeredUsers: [{
      id: account.userId, lineUserId: account.userId, nickname: account.nickname,
      avatarUrl: '', cardImageUrl: '', bio: '', defaultArea: '信義區', interests: [],
      tier: 'standard', role: 'user', lineOAFollowed: false, createdAt: account.createdAt,
    }] });
    await recordAdminAudit({ adminUserId: auth.session.userId, action: 'create-customer', target: account.key, detail: `userId=${account.userId};source=admin` });
    return NextResponse.json({ ok: true, account: account.key, nickname: account.nickname }, { status: 201 });
  } catch (error) {
    console.error('[create customer]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: '建立未完成，請先搜尋帳號確認結果後再重試' }, { status: 500 });
  }
}
