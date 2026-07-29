import crypto from 'crypto';
import { getRedis, kvKey } from './kv';

const ISSUES_KEY = kvKey('sl:issues:h:v1');
const MAX_ISSUES = 1000;

export interface IssueReport {
  id: string;
  reporterId: string;
  description: string;
  page: string;
  requestId?: string;
  threadId?: string;
  traceId?: string;
  lastErrorCode?: string;
  userAgent: string;
  createdAt: string;
  resolved: boolean;
}

const memoryIssues: IssueReport[] = [];

const safeText = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().slice(0, max);
  return normalized || undefined;
};

export async function addIssueReport(input: {
  reporterId: string;
  description: string;
  page: string;
  requestId?: string;
  threadId?: string;
  traceId?: string;
  lastErrorCode?: string;
  userAgent: string;
}): Promise<IssueReport> {
  const issue: IssueReport = {
    id: `issue-${crypto.randomUUID()}`,
    reporterId: safeText(input.reporterId, 128) ?? 'unknown',
    description: safeText(input.description, 1000) ?? '未填說明',
    page: safeText(input.page, 300) ?? '/',
    userAgent: safeText(input.userAgent, 300) ?? 'unknown',
    createdAt: new Date().toISOString(),
    resolved: false,
    ...(safeText(input.requestId, 128) ? { requestId: safeText(input.requestId, 128) } : {}),
    ...(safeText(input.threadId, 256) ? { threadId: safeText(input.threadId, 256) } : {}),
    ...(safeText(input.traceId, 128) ? { traceId: safeText(input.traceId, 128) } : {}),
    ...(safeText(input.lastErrorCode, 160) ? { lastErrorCode: safeText(input.lastErrorCode, 160) } : {}),
  };
  const redis = getRedis();
  if (redis) {
    await redis.hset(ISSUES_KEY, { [issue.id]: issue });
  } else {
    memoryIssues.unshift(issue);
    if (memoryIssues.length > MAX_ISSUES) memoryIssues.length = MAX_ISSUES;
  }
  return issue;
}

export async function listIssueReports(limit = 500): Promise<IssueReport[]> {
  const safeLimit = Math.min(Math.max(limit, 1), MAX_ISSUES);
  const redis = getRedis();
  if (redis) {
    const records = await redis.hgetall(ISSUES_KEY) as Record<string, IssueReport> | null;
    return Object.values(records ?? {})
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, safeLimit);
  }
  return memoryIssues.slice(0, safeLimit);
}

export async function setIssueResolved(id: string, resolved: boolean): Promise<boolean> {
  const issues = await listIssueReports(MAX_ISSUES);
  const index = issues.findIndex((issue) => issue.id === id);
  if (index < 0) return false;
  issues[index] = { ...issues[index], resolved };
  const redis = getRedis();
  if (redis) {
    await redis.hset(ISSUES_KEY, { [id]: issues[index] });
  } else {
    memoryIssues.length = 0;
    memoryIssues.push(...issues);
  }
  return true;
}
