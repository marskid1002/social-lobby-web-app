import { listAccounts } from './auth-store';
import { getCollection } from './sync-store';
import { listManagerPrivateNames } from './manager-private-name-store';
import {
  buildAdminEscortDirectory,
  queryAdminEscortDirectory,
  type AdminAccountSummary,
  type AdminEscortDirectoryResult,
} from './admin-dashboard';

const value = (input: unknown): string => typeof input === 'string' ? input : '';

function asPositiveInteger(input: string | null, fallback: number): number {
  const parsed = Number(input);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export async function loadAdminEscortDirectory(input: {
  searchParams: URLSearchParams;
  includeAvatars?: boolean;
  privateNameViewerId?: string;
}): Promise<AdminEscortDirectoryResult> {
  const [rawAccounts, escorts, presence, responses, invitations, photoOverrides, privateNames] = await Promise.all([
    listAccounts(),
    getCollection('escorts'),
    getCollection('presence'),
    getCollection('responses'),
    getCollection('invitations'),
    input.includeAvatars ? getCollection('photoOverrides') : Promise.resolve([]),
    input.privateNameViewerId
      ? listManagerPrivateNames(input.privateNameViewerId)
      : Promise.resolve(new Map<string, string>()),
  ]);
  const accounts: AdminAccountSummary[] = rawAccounts.map((account) => ({
    key: account.key,
    role: account.role,
    tier: account.tier,
    userId: account.userId,
    nickname: account.nickname,
    hasPassword: Boolean(account.hash),
    disabled: Boolean(account.disabled),
    archived: Boolean(account.archived),
    createdAt: account.createdAt,
  }));
  const avatarByEscort = new Map(
    photoOverrides.map((item) => [item.id, value(item.avatarUrl)]),
  );
  const entries = buildAdminEscortDirectory({
    accounts,
    escorts,
    presence,
    responses,
    invitations,
    ...(input.includeAvatars ? { avatarByEscort } : {}),
    ...(input.privateNameViewerId ? { managerPrivateNames: privateNames } : {}),
  });

  return queryAdminEscortDirectory(entries, {
    q: input.searchParams.get('q') ?? '',
    status: input.searchParams.get('status') as 'all' | 'online' | 'busy' | 'offline' | 'unset' | undefined,
    managerId: input.searchParams.get('managerId') ?? '',
    sort: input.searchParams.get('sort') as 'status' | 'updated' | 'name' | 'manager' | undefined,
    page: asPositiveInteger(input.searchParams.get('page'), 1),
    pageSize: asPositiveInteger(input.searchParams.get('pageSize'), 50),
  });
}
