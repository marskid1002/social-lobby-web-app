import { getRedis, kvKey } from './kv';

type Item = { id: string; [key: string]: unknown };
type HistorySource = {
  requests: Item[];
  responses: Item[];
  invitations: Item[];
  chatMessages: Item[];
  escorts: Item[];
  registeredUsers: Item[];
};

export type RequestHistoryResult = 'completed' | 'confirmed' | 'declined' | 'cancelled' | 'expired';

export interface RequestHistoryParticipant {
  responseId: string;
  userId: string;
  userName: string;
  dispatcherId?: string;
  dispatcherName?: string;
  responseStatus: string;
  invitationStatus?: string;
  managerDecision?: string;
  meetupEndedAt?: string;
}

export interface RequestHistoryRecord {
  id: string;
  creatorId: string;
  creatorName: string;
  area: string;
  requestType: string;
  requestTypes: string[];
  venueType: string;
  partyFormat: string;
  peopleCount: number;
  note: string;
  status: string;
  result: RequestHistoryResult;
  createdAt: string;
  expiresAt: string;
  archivedAt: string;
  responseCount: number;
  chatCount: number;
  messageCount: number;
  participants: RequestHistoryParticipant[];
}

const HISTORY_KEY = kvKey('sl:request-history:v1');
const memory = new Map<string, RequestHistoryRecord>();
const text = (value: unknown): string => typeof value === 'string' ? value : '';

function parse(value: unknown): RequestHistoryRecord | null {
  if (!value) return null;
  if (typeof value === 'object') return value as RequestHistoryRecord;
  try { return JSON.parse(String(value)) as RequestHistoryRecord; } catch { return null; }
}

function snapshotJson(record: RequestHistoryRecord): string {
  const { archivedAt: _archivedAt, ...snapshot } = record;
  return JSON.stringify(snapshot);
}

function resultFor(request: Item, invitations: Item[]): RequestHistoryResult {
  if (request.status === 'cancelled') return 'cancelled';
  if (invitations.some((item) => item.managerDecision === 'confirmed' || item.meetupConfirmed === true)) {
    return 'confirmed';
  }
  if (invitations.some((item) => item.managerDecision === 'declined')) return 'declined';
  if (request.status === 'closed') return 'completed';
  return 'expired';
}

/**
 * 將即將清理或已結案的局轉成 A000 專用營運快照。
 * 僅保存局與參與結果 metadata，不保存聊天文字、照片網址或使用者聯絡資料。
 */
export async function archiveRequestHistory(
  source: HistorySource,
  requestIds: Iterable<string>,
  now: Date = new Date(),
): Promise<RequestHistoryRecord[]> {
  const ids = new Set(requestIds);
  if (ids.size === 0) return [];
  const names = new Map<string, string>();
  for (const profile of source.registeredUsers) {
    const name = text(profile.nickname);
    if (profile.id && name) names.set(profile.id, name);
  }
  for (const escort of source.escorts) {
    const name = text(escort.nickname);
    if (escort.id && name) names.set(escort.id, name);
  }

  const archivedAt = now.toISOString();
  const records = source.requests.flatMap((request): RequestHistoryRecord[] => {
    if (!ids.has(request.id)) return [];
    const responses = source.responses.filter((response) => text(response.requestId) === request.id);
    const invitations = source.invitations.filter((invitation) => text(invitation.requestId) === request.id);
    const invitationByResponse = new Map(
      invitations.map((invitation) => [text(invitation.responseId), invitation]),
    );
    const creatorId = text(request.creatorId);
    return [{
      id: request.id,
      creatorId,
      creatorName: names.get(creatorId) || creatorId || '未知客戶',
      area: text(request.area),
      requestType: text(request.requestType),
      requestTypes: Array.isArray(request.requestTypes)
        ? request.requestTypes.filter((value): value is string => typeof value === 'string')
        : [],
      venueType: text(request.venueType),
      partyFormat: text(request.partyFormat),
      peopleCount: typeof request.peopleCount === 'number' ? request.peopleCount : 0,
      note: text(request.note),
      status: text(request.status),
      result: resultFor(request, invitations),
      createdAt: text(request.createdAt),
      expiresAt: text(request.expiresAt),
      archivedAt,
      responseCount: responses.length,
      chatCount: invitations.filter((invitation) => invitation.status === 'accepted').length,
      messageCount: source.chatMessages.filter((message) => text(message.requestId) === request.id).length,
      participants: responses.map((response) => {
        const userId = text(response.userId);
        const dispatcherId = text(response.dispatcherId);
        const invitation = invitationByResponse.get(response.id);
        return {
          responseId: response.id,
          userId,
          userName: names.get(userId) || userId || '未知人員',
          ...(dispatcherId ? {
            dispatcherId,
            dispatcherName: names.get(dispatcherId) || dispatcherId,
          } : {}),
          responseStatus: text(response.responseStatus),
          ...(invitation ? {
            invitationStatus: text(invitation.status),
            managerDecision: text(invitation.managerDecision) || undefined,
            meetupEndedAt: text(invitation.meetupEndedAt) || undefined,
          } : {}),
        };
      }),
    }];
  });

  if (records.length === 0) return [];
  const redis = getRedis();
  const existing = redis
    ? new Map(
        Object.entries((await redis.hgetall(HISTORY_KEY)) ?? {})
          .map(([id, value]) => [id, parse(value)] as const)
          .filter((entry): entry is readonly [string, RequestHistoryRecord] => Boolean(entry[1])),
      )
    : new Map(memory);
  const changed: RequestHistoryRecord[] = [];
  const resolved = records.map((record) => {
    const previous = existing.get(record.id);
    if (previous && snapshotJson(previous) === snapshotJson(record)) return previous;
    changed.push(record);
    return record;
  });

  if (redis && changed.length > 0) {
    const payload = Object.fromEntries(changed.map((record) => [record.id, record]));
    await redis.hset(HISTORY_KEY, payload);
  } else if (!redis) {
    for (const record of changed) memory.set(record.id, record);
  }
  return resolved;
}

export async function listRequestHistory(limit = 2000): Promise<RequestHistoryRecord[]> {
  const redis = getRedis();
  const records = redis
    ? Object.values((await redis.hgetall(HISTORY_KEY)) ?? {}).map(parse).filter(Boolean) as RequestHistoryRecord[]
    : [...memory.values()];
  return records
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, Math.min(limit, 5000)));
}

/** 測試專用；正式後台的「清除局與聊天」刻意不刪歷史封存。 */
export async function clearRequestHistory(): Promise<void> {
  const redis = getRedis();
  if (redis) await redis.del(HISTORY_KEY);
  memory.clear();
}
