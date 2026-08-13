import 'server-only';
import { randomUUID } from 'crypto';
import { getRedis, kvKey } from './kv';

const SYSTEM_MESSAGES_KEY = kvKey('sl:system-messages:h:v1');
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export interface SystemMessageRecord {
  id: string;
  recipientId: string;
  recipientAccount: string;
  recipientName: string;
  recipientRole: 'user' | 'manager';
  title: string;
  content: string;
  senderId: string;
  createdAt: string;
  readAt?: string;
  pushSent: number;
  pushTotal: number;
  pushSkipped?: string;
}

const memoryMessages = new Map<string, SystemMessageRecord>();

function parse(value: unknown): SystemMessageRecord | null {
  if (value && typeof value === 'object') return value as SystemMessageRecord;
  try { return JSON.parse(String(value)) as SystemMessageRecord; } catch { return null; }
}

async function allMessages(): Promise<SystemMessageRecord[]> {
  const redis = getRedis();
  const records = redis
    ? Object.values((await redis.hgetall(SYSTEM_MESSAGES_KEY)) as Record<string, unknown> || {})
        .map(parse).filter(Boolean) as SystemMessageRecord[]
    : [...memoryMessages.values()];
  const cutoff = Date.now() - RETENTION_MS;
  const expired = records.filter((record) => Date.parse(record.createdAt) < cutoff);
  if (expired.length > 0) {
    if (redis) await redis.hdel(SYSTEM_MESSAGES_KEY, ...expired.map((record) => record.id));
    else expired.forEach((record) => memoryMessages.delete(record.id));
  }
  return records
    .filter((record) => Date.parse(record.createdAt) >= cutoff)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createSystemMessage(input: Omit<SystemMessageRecord, 'id' | 'createdAt' | 'pushSent' | 'pushTotal'>) {
  const record: SystemMessageRecord = {
    ...input,
    id: `sm-${randomUUID()}`,
    createdAt: new Date().toISOString(),
    pushSent: 0,
    pushTotal: 0,
  };
  const redis = getRedis();
  if (redis) await redis.hset(SYSTEM_MESSAGES_KEY, { [record.id]: record });
  else memoryMessages.set(record.id, record);
  return record;
}

export async function updateSystemMessagePush(
  id: string,
  result: { sent: number; total?: number; skipped?: string },
) {
  const record = (await allMessages()).find((message) => message.id === id);
  if (!record) return null;
  const next = {
    ...record,
    pushSent: result.sent,
    pushTotal: result.total ?? 0,
    ...(result.skipped ? { pushSkipped: result.skipped } : {}),
  };
  const redis = getRedis();
  if (redis) await redis.hset(SYSTEM_MESSAGES_KEY, { [id]: next });
  else memoryMessages.set(id, next);
  return next;
}

export async function listSystemMessages(limit = 200) {
  return (await allMessages()).slice(0, Math.min(Math.max(limit, 1), 500));
}

export async function listSystemMessagesForUser(userId: string) {
  return (await allMessages()).filter((message) => message.recipientId === userId);
}

export async function markSystemMessageRead(userId: string, id: string) {
  const record = (await allMessages()).find(
    (message) => message.id === id && message.recipientId === userId,
  );
  if (!record) return null;
  if (record.readAt) return record;
  const next = { ...record, readAt: new Date().toISOString() };
  const redis = getRedis();
  if (redis) await redis.hset(SYSTEM_MESSAGES_KEY, { [id]: next });
  else memoryMessages.set(id, next);
  return next;
}
