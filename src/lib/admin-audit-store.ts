import crypto from 'crypto';
import { getRedis, kvKey } from './kv';

const AUDIT_KEY = kvKey('sl:admin-audit:v2');
const MAX_AUDIT_RECORDS = 500;

export interface AdminAuditRecord {
  id: string;
  adminUserId: string;
  action: string;
  target?: string;
  detail?: string;
  createdAt: string;
}

const memoryAudit: AdminAuditRecord[] = [];

const safeText = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().slice(0, max);
  return normalized || undefined;
};

export async function recordAdminAudit(input: {
  adminUserId: string;
  action: string;
  target?: string;
  detail?: string;
}): Promise<void> {
  const record: AdminAuditRecord = {
    id: `aa-${crypto.randomUUID()}`,
    adminUserId: safeText(input.adminUserId, 128) ?? 'unknown',
    action: safeText(input.action, 80) ?? 'unknown',
    createdAt: new Date().toISOString(),
    ...(safeText(input.target, 160) ? { target: safeText(input.target, 160) } : {}),
    ...(safeText(input.detail, 300) ? { detail: safeText(input.detail, 300) } : {}),
  };
  const redis = getRedis();
  if (redis) {
    // 原子追加與裁切，避免同時操作時讀改寫互相覆蓋稽核紀錄。
    await redis.multi()
      .lpush(AUDIT_KEY, record)
      .ltrim(AUDIT_KEY, 0, MAX_AUDIT_RECORDS - 1)
      .exec();
    return;
  }
  memoryAudit.unshift(record);
  if (memoryAudit.length > MAX_AUDIT_RECORDS) {
    memoryAudit.length = MAX_AUDIT_RECORDS;
  }
}

export async function listAdminAudit(limit = 100): Promise<AdminAuditRecord[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const redis = getRedis();
  if (redis) {
    return await redis.lrange(AUDIT_KEY, 0, safeLimit - 1) as AdminAuditRecord[];
  }
  return memoryAudit.slice(0, safeLimit);
}
