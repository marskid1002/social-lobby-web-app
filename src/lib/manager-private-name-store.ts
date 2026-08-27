import 'server-only';

import { getRedis, kvKey } from './kv';

const PRIVATE_NAME_KEY = kvKey('sl:h:v1:manager-private-names');
export const MAX_MANAGER_PRIVATE_NAME_LENGTH = 60;

export interface ManagerPrivateNameRecord {
  id: string;
  viewerUserId: string;
  managerUserId: string;
  privateName: string;
  updatedAt: string;
}

const memoryPrivateNames = new Map<string, ManagerPrivateNameRecord>();

function recordId(viewerUserId: string, managerUserId: string): string {
  return `${viewerUserId}::${managerUserId}`;
}

function parseRecord(value: unknown): ManagerPrivateNameRecord | null {
  if (!value) return null;
  if (typeof value === 'object') return value as ManagerPrivateNameRecord;
  try {
    return JSON.parse(String(value)) as ManagerPrivateNameRecord;
  } catch {
    return null;
  }
}

export async function listManagerPrivateNames(viewerUserId: string): Promise<Map<string, string>> {
  const redis = getRedis();
  const records = redis
    ? Object.values((await redis.hgetall(PRIVATE_NAME_KEY)) ?? {}).map(parseRecord).filter(Boolean) as ManagerPrivateNameRecord[]
    : [...memoryPrivateNames.values()];

  return new Map(
    records
      .filter((record) => record.viewerUserId === viewerUserId && record.privateName)
      .map((record) => [record.managerUserId, record.privateName]),
  );
}

export async function setManagerPrivateName(input: {
  viewerUserId: string;
  managerUserId: string;
  privateName: string;
}): Promise<void> {
  const privateName = input.privateName.trim().slice(0, MAX_MANAGER_PRIVATE_NAME_LENGTH);
  const id = recordId(input.viewerUserId, input.managerUserId);
  const redis = getRedis();

  if (!privateName) {
    if (redis) await redis.hdel(PRIVATE_NAME_KEY, id);
    else memoryPrivateNames.delete(id);
    return;
  }

  const record: ManagerPrivateNameRecord = {
    id,
    viewerUserId: input.viewerUserId,
    managerUserId: input.managerUserId,
    privateName,
    updatedAt: new Date().toISOString(),
  };
  if (redis) await redis.hset(PRIVATE_NAME_KEY, { [id]: record });
  else memoryPrivateNames.set(id, record);
}
