import crypto from 'crypto';
import { getRedis, kvKey } from './kv';

const TRACE_EVENTS_KEY = kvKey('sl:flow-trace-events:v1');
const TRACE_REQUESTS_KEY = kvKey('sl:flow-trace-requests:v1');
const TRACE_DEDUPE_KEY = kvKey('sl:flow-trace-dedupe:v1');
const MAX_TRACE_EVENTS = 5000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type TraceOutcome = 'success' | 'failure' | 'skipped';

export interface FlowTraceEvent {
  id: string;
  traceId: string;
  eventType: string;
  outcome: TraceOutcome;
  createdAt: string;
  actorUserId?: string;
  requestId?: string;
  threadId?: string;
  entityId?: string;
  code?: string;
  detail?: string;
}

const memoryEvents: FlowTraceEvent[] = [];
const memoryRequestTraces = new Map<string, string>();
const memoryDedupe = new Set<string>();

const safeText = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().slice(0, max);
  return normalized || undefined;
};

function sanitizeEvent(input: {
  traceId: string;
  eventType: string;
  outcome?: TraceOutcome;
  actorUserId?: string;
  requestId?: string;
  threadId?: string;
  entityId?: string;
  code?: string;
  detail?: string;
}): FlowTraceEvent {
  return {
    id: `fte-${crypto.randomUUID()}`,
    traceId: safeText(input.traceId, 128) ?? `tr-${crypto.randomUUID()}`,
    eventType: safeText(input.eventType, 80) ?? 'unknown',
    outcome: input.outcome ?? 'success',
    createdAt: new Date().toISOString(),
    ...(safeText(input.actorUserId, 128) ? { actorUserId: safeText(input.actorUserId, 128) } : {}),
    ...(safeText(input.requestId, 128) ? { requestId: safeText(input.requestId, 128) } : {}),
    ...(safeText(input.threadId, 256) ? { threadId: safeText(input.threadId, 256) } : {}),
    ...(safeText(input.entityId, 160) ? { entityId: safeText(input.entityId, 160) } : {}),
    ...(safeText(input.code, 80) ? { code: safeText(input.code, 80) } : {}),
    ...(safeText(input.detail, 200) ? { detail: safeText(input.detail, 200) } : {}),
  };
}

export async function getOrCreateTraceId(requestId: string): Promise<string> {
  const safeRequestId = safeText(requestId, 128);
  if (!safeRequestId) return `tr-${crypto.randomUUID()}`;
  const redis = getRedis();
  if (redis) {
    const existing = await redis.hget(TRACE_REQUESTS_KEY, safeRequestId);
    if (typeof existing === 'string' && existing) return existing;
    const candidate = `tr-${crypto.randomUUID()}`;
    await redis.hsetnx(TRACE_REQUESTS_KEY, safeRequestId, candidate);
    return String(await redis.hget(TRACE_REQUESTS_KEY, safeRequestId) ?? candidate);
  }
  const existing = memoryRequestTraces.get(safeRequestId);
  if (existing) return existing;
  const traceId = `tr-${crypto.randomUUID()}`;
  memoryRequestTraces.set(safeRequestId, traceId);
  return traceId;
}

export async function recordFlowTrace(input: {
  traceId?: string;
  eventType: string;
  outcome?: TraceOutcome;
  actorUserId?: string;
  requestId?: string;
  threadId?: string;
  entityId?: string;
  code?: string;
  detail?: string;
  dedupeKey?: string;
}): Promise<FlowTraceEvent | null> {
  const requestId = safeText(input.requestId, 128);
  const traceId = safeText(input.traceId, 128)
    ?? (requestId ? await getOrCreateTraceId(requestId) : `tr-${crypto.randomUUID()}`);
  const dedupeKey = safeText(input.dedupeKey, 300);
  const redis = getRedis();

  if (dedupeKey) {
    if (redis) {
      const added = await redis.hsetnx(TRACE_DEDUPE_KEY, dedupeKey, Date.now());
      if (!added) return null;
      await redis.expire(TRACE_DEDUPE_KEY, Math.ceil(RETENTION_MS / 1000));
    } else {
      if (memoryDedupe.has(dedupeKey)) return null;
      memoryDedupe.add(dedupeKey);
    }
  }

  const event = sanitizeEvent({ ...input, traceId, requestId });
  if (redis) {
    await redis.multi()
      .lpush(TRACE_EVENTS_KEY, event)
      .ltrim(TRACE_EVENTS_KEY, 0, MAX_TRACE_EVENTS - 1)
      .exec();
  } else {
    memoryEvents.unshift(event);
    if (memoryEvents.length > MAX_TRACE_EVENTS) memoryEvents.length = MAX_TRACE_EVENTS;
  }
  return event;
}

export async function listFlowTraces(input: {
  limit?: number;
  query?: string;
  requestId?: string;
  traceId?: string;
} = {}): Promise<FlowTraceEvent[]> {
  const limit = Math.min(Math.max(input.limit ?? 500, 1), 1000);
  const redis = getRedis();
  const records = redis
    ? await redis.lrange(TRACE_EVENTS_KEY, 0, MAX_TRACE_EVENTS - 1) as FlowTraceEvent[]
    : memoryEvents;
  const cutoff = Date.now() - RETENTION_MS;
  const query = safeText(input.query, 160)?.toLowerCase();
  const requestId = safeText(input.requestId, 128);
  const traceId = safeText(input.traceId, 128);

  return records.filter((record) => {
    if (Date.parse(record.createdAt) < cutoff) return false;
    if (requestId && record.requestId !== requestId) return false;
    if (traceId && record.traceId !== traceId) return false;
    if (!query) return true;
    return [
      record.traceId,
      record.requestId,
      record.threadId,
      record.actorUserId,
      record.entityId,
      record.eventType,
      record.code,
    ].some((value) => value?.toLowerCase().includes(query));
  }).slice(0, limit);
}

export async function clearFlowTracesForTests(): Promise<void> {
  if (getRedis()) throw new Error('Refusing to clear trace records while Redis is configured');
  memoryEvents.length = 0;
  memoryRequestTraces.clear();
  memoryDedupe.clear();
}
