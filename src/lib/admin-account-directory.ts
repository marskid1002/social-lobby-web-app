import { listAccounts, type Account, type AccountRole } from './auth-store';

export type AdminAccountGroup = 'manager' | 'user' | 'staff';

export interface AdminAccountDirectoryEntry {
  key: string;
  accountRef: string;
  role: AccountRole;
  tier: string;
  userId: string;
  nickname: string;
  hasPassword: boolean;
  disabled: boolean;
  archived: boolean;
  hasActivationCode: boolean;
  activationCreatedAt?: string;
  createdAt: string;
}

export interface AdminAccountDirectoryResult {
  items: AdminAccountDirectoryEntry[];
  counts: Record<AdminAccountGroup, number>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

function accountGroup(role: AccountRole): AdminAccountGroup {
  if (role === 'manager') return 'manager';
  if (role === 'user') return 'user';
  return 'staff';
}

function maskedAccountKey(account: Account): string {
  return account.role === 'user' && /^\d{8,15}$/.test(account.key)
    ? `${account.key.slice(0, 3)}****${account.key.slice(-3)}`
    : account.key;
}

function safeAccount(account: Account): AdminAccountDirectoryEntry {
  return {
    key: maskedAccountKey(account),
    accountRef: account.userId,
    role: account.role,
    tier: account.tier,
    userId: account.userId,
    nickname: account.nickname,
    hasPassword: Boolean(account.hash),
    disabled: Boolean(account.disabled),
    archived: Boolean(account.archived),
    hasActivationCode: Boolean(account.activationHash),
    ...(account.activationCreatedAt ? { activationCreatedAt: account.activationCreatedAt } : {}),
    createdAt: account.createdAt,
  };
}

export function queryAdminAccounts(
  accounts: Account[],
  input: { group?: AdminAccountGroup; q?: string; page?: number; pageSize?: number } = {},
): AdminAccountDirectoryResult {
  const group: AdminAccountGroup = ['manager', 'user', 'staff'].includes(input.group ?? '')
    ? input.group as AdminAccountGroup
    : 'manager';
  const query = (input.q ?? '').trim().toLowerCase();
  const requestedPage = Number.isFinite(input.page) ? Math.floor(input.page as number) : 1;
  const requestedPageSize = Number.isFinite(input.pageSize) ? Math.floor(input.pageSize as number) : 50;
  const pageSize = Math.min(100, Math.max(1, requestedPageSize));
  const counts = accounts.reduce<AdminAccountDirectoryResult['counts']>((result, account) => {
    result[accountGroup(account.role)] += 1;
    return result;
  }, { manager: 0, user: 0, staff: 0 });
  const matched = accounts
    .filter((account) => accountGroup(account.role) === group)
    .filter((account) => !query || [account.key, account.nickname, account.userId]
      .some((field) => field.toLowerCase().includes(query)))
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  const total = matched.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, Math.max(1, requestedPage));
  const start = (page - 1) * pageSize;
  return {
    items: matched.slice(start, start + pageSize).map(safeAccount),
    counts,
    pagination: { page, pageSize, total, totalPages },
  };
}

export async function loadAdminAccountDirectory(input: {
  group?: AdminAccountGroup;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  return queryAdminAccounts(await listAccounts(), input);
}
