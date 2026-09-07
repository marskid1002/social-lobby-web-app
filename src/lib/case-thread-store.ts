import 'server-only';
import { randomUUID } from 'crypto';
import { getRedis, kvKey } from './kv';

const CASE_THREADS_KEY = kvKey('sl:case-threads:h:v1');
const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_MESSAGES_PER_THREAD = 100;

export type CaseKind = 'issue' | 'report';
export type CaseStatus = 'pending_admin' | 'waiting_reporter' | 'reporter_replied' | 'resolved';

export interface CaseMessage {
  id: string;
  senderId: string;
  senderRole: 'admin' | 'reporter';
  content: string;
  createdAt: string;
}

export interface CaseThread {
  id: string;
  kind: CaseKind;
  caseId: string;
  reporterId: string;
  status: CaseStatus;
  updatedAt: string;
  messages: CaseMessage[];
}

const memoryThreads = new Map<string, CaseThread>();
const threadId = (kind: CaseKind, caseId: string) => `${kind}:${caseId}`;

function parse(value: unknown): CaseThread | null {
  if (value && typeof value === 'object') return value as CaseThread;
  try { return JSON.parse(String(value)) as CaseThread; } catch { return null; }
}

async function save(thread: CaseThread): Promise<void> {
  const redis = getRedis();
  if (redis) await redis.hset(CASE_THREADS_KEY, { [thread.id]: thread });
  else memoryThreads.set(thread.id, thread);
}

export async function getCaseThread(kind: CaseKind, caseId: string): Promise<CaseThread | null> {
  const id = threadId(kind, caseId);
  const redis = getRedis();
  return redis ? parse(await redis.hget(CASE_THREADS_KEY, id)) : memoryThreads.get(id) ?? null;
}

export async function listCaseThreads(limit = 1000): Promise<CaseThread[]> {
  const redis = getRedis();
  const records = redis
    ? Object.values((await redis.hgetall(CASE_THREADS_KEY)) as Record<string, unknown> || {})
        .map(parse).filter(Boolean) as CaseThread[]
    : [...memoryThreads.values()];
  const cutoff = Date.now() - RETENTION_MS;
  const active = records.filter((thread) => Date.parse(thread.updatedAt) >= cutoff);
  const expired = records.filter((thread) => Date.parse(thread.updatedAt) < cutoff);
  if (expired.length > 0) {
    if (redis) await redis.hdel(CASE_THREADS_KEY, ...expired.map((thread) => thread.id));
    else expired.forEach((thread) => memoryThreads.delete(thread.id));
  }
  return active
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, Math.min(Math.max(limit, 1), 1000));
}

export async function appendCaseMessage(input: {
  kind: CaseKind;
  caseId: string;
  reporterId: string;
  senderId: string;
  senderRole: 'admin' | 'reporter';
  content: string;
}): Promise<CaseThread> {
  const now = new Date().toISOString();
  const current = await getCaseThread(input.kind, input.caseId);
  const message: CaseMessage = {
    id: `case-msg-${randomUUID()}`,
    senderId: input.senderId,
    senderRole: input.senderRole,
    content: input.content,
    createdAt: now,
  };
  const next: CaseThread = {
    id: threadId(input.kind, input.caseId),
    kind: input.kind,
    caseId: input.caseId,
    reporterId: input.reporterId,
    status: input.senderRole === 'admin' ? 'waiting_reporter' : 'reporter_replied',
    updatedAt: now,
    messages: [...(current?.messages ?? []), message].slice(-MAX_MESSAGES_PER_THREAD),
  };
  await save(next);
  return next;
}

export async function setCaseStatus(
  kind: CaseKind,
  caseId: string,
  reporterId: string,
  status: CaseStatus,
): Promise<CaseThread> {
  const current = await getCaseThread(kind, caseId);
  const next: CaseThread = {
    id: threadId(kind, caseId),
    kind,
    caseId,
    reporterId,
    status,
    updatedAt: new Date().toISOString(),
    messages: current?.messages ?? [],
  };
  await save(next);
  return next;
}
