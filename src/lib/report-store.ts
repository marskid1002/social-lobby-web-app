/**
 * 檢舉儲存層。生產：Upstash/KV Redis；本地：記憶體 fallback。
 * 單一 key 存 { [id]: Report }。
 */
import crypto from 'crypto';
import { getRedis, kvKey } from './kv';

const REPORTS_KEY = kvKey('sl:reports:v1');

export interface Report {
  id: string;
  reporterId: string;
  targetId: string;
  targetName?: string;
  reason: string;
  createdAt: string;
  resolved: boolean;
}

type ReportsMap = Record<string, Report>;
const mem: ReportsMap = {};

async function readAll(): Promise<ReportsMap> {
  const redis = getRedis();
  if (redis) return ((await redis.get(REPORTS_KEY)) as ReportsMap | null) ?? {};
  return mem;
}
async function writeAll(data: ReportsMap) {
  const redis = getRedis();
  if (redis) { await redis.set(REPORTS_KEY, data); }
  else { for (const k of Object.keys(mem)) delete mem[k]; Object.assign(mem, data); }
}

export async function addReport(r: Omit<Report, 'id' | 'createdAt' | 'resolved'>): Promise<Report> {
  const all = await readAll();
  const report: Report = { ...r, id: `rep-${crypto.randomUUID()}`, createdAt: new Date().toISOString(), resolved: false };
  all[report.id] = report;
  await writeAll(all);
  return report;
}

export async function listReports(): Promise<Report[]> {
  const all = await readAll();
  return Object.values(all).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // 新到舊
}

export async function setReportResolved(id: string, resolved: boolean): Promise<boolean> {
  const all = await readAll();
  if (!all[id]) return false;
  all[id].resolved = resolved;
  await writeAll(all);
  return true;
}
