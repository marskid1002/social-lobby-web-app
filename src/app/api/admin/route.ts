import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import {
  listAccounts, adminResetPassword, setAccountDisabled, deleteAccount,
} from '@/lib/auth-store';
import { deleteUserData, clearShared } from '@/lib/sync-store';
import { removeSubscriptionsForUser } from '@/lib/push-store';
import { listReports, setReportResolved } from '@/lib/report-store';

export const dynamic = 'force-dynamic';

// 僅限管理員(A000)存取
async function requireAdmin(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  return s && s.role === 'admin' ? s : null;
}

// 回前端前去除敏感欄位（salt/hash）
function safeAccount(a: { key: string; role: string; tier: string; userId: string; nickname: string; hash: string | null; disabled?: boolean; createdAt: string }) {
  return {
    key: a.key, role: a.role, tier: a.tier, userId: a.userId, nickname: a.nickname,
    hasPassword: a.hash !== null, disabled: Boolean(a.disabled), createdAt: a.createdAt,
  };
}

// GET：後台總覽（帳號清單 + 檢舉）
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const [accounts, reports] = await Promise.all([
    listAccounts().then((list) => list.map(safeAccount)),
    listReports(),
  ]);
  return NextResponse.json({ accounts, reports });
}

// POST：管理動作
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const body = await req.json();
    const { action, account } = body as { action?: string; account?: string; reportId?: string };

    // 檢舉處理（用 reportId，不需 account）
    if (action === 'resolve-report' || action === 'reopen-report') {
      if (!body.reportId) return NextResponse.json({ error: '缺少檢舉編號' }, { status: 400 });
      const ok = await setReportResolved(String(body.reportId), action === 'resolve-report');
      return NextResponse.json({ ok });
    }

    // 清除所有「局 / 回應 / 邀請 / 通知 / 對話」（保留小姐、照片、帳號），供測試重來（不需 account）
    if (action === 'clear-shared') {
      await clearShared(['requests', 'responses', 'invitations', 'updates', 'chatMessages']);
      return NextResponse.json({ ok: true });
    }

    if (!account) return NextResponse.json({ error: '缺少帳號' }, { status: 400 });

    if (action === 'reset') {
      const ok = await adminResetPassword(account);
      return NextResponse.json({ ok });
    }
    if (action === 'disable' || action === 'enable') {
      const ok = await setAccountDisabled(account, action === 'disable');
      return NextResponse.json({ ok });
    }
    if (action === 'delete') {
      const removed = await deleteAccount(account); // 僅限客戶
      if (!removed) return NextResponse.json({ error: '此帳號不可刪除（僅限客戶）' }, { status: 400 });
      // 級聯清除該使用者的資料與推播訂閱（不可復原）
      await deleteUserData(removed.userId);
      await removeSubscriptionsForUser(removed.userId);
      return NextResponse.json({ ok: true, deletedUserId: removed.userId });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[admin]', e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
