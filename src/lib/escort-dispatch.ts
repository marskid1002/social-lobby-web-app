import type { SessionPayload } from './session';
import { activeConfirmedGirlIds } from './request-attendance';

type Item = { id: string; [key: string]: unknown };

type DispatchSuccess = {
  ok: true;
  requestId: string;
  responses: Item[];
  updates: Item[];
};

type DispatchFailure = { ok: false; status: number; error: string };

const text = (value: unknown): string => typeof value === 'string' ? value : '';

export function planEscortDispatch(input: {
  session: SessionPayload;
  requestId: string;
  escortIds: string[];
  requests: Item[];
  escorts: Item[];
  responses: Item[];
  invitations: Item[];
  now?: Date;
}): DispatchSuccess | DispatchFailure {
  if (input.session.role !== 'manager') {
    return { ok: false, status: 403, error: '只有幹部可以安排出席' };
  }

  const request = input.requests.find((item) => item.id === input.requestId);
  if (!request) return { ok: false, status: 404, error: '找不到這個局，請重新整理後再試' };
  if (request.status !== 'open') return { ok: false, status: 409, error: '這個局已經結束，無法再安排出席' };
  const expiresAt = Date.parse(text(request.expiresAt));
  if (Number.isFinite(expiresAt) && expiresAt <= (input.now?.getTime() ?? Date.now())) {
    return { ok: false, status: 409, error: '這個局已經過期，無法再安排出席' };
  }

  const uniqueEscortIds = [...new Set(input.escortIds)];
  if (uniqueEscortIds.length === 0 || uniqueEscortIds.length > 20) {
    return { ok: false, status: 400, error: '請選擇 1 至 20 位人員' };
  }

  const ownedEscorts = new Map(
    input.escorts
      .filter((escort) => escort.managerId === input.session.userId && escort.removed !== true)
      .map((escort) => [escort.id, escort]),
  );
  const missing = uniqueEscortIds.find((id) => !ownedEscorts.has(id));
  if (missing) {
    return { ok: false, status: 409, error: '人員資料尚未在伺服器建立完成，請重新整理後再試' };
  }

  const busy = activeConfirmedGirlIds(input.responses, input.invitations, input.now?.getTime());
  if (uniqueEscortIds.some((id) => busy.has(id))) {
    return { ok: false, status: 409, error: '選擇的人員中有人正在約會，請重新選擇' };
  }

  const effective = new Map<string, Item>();
  for (const response of input.responses) {
    if (text(response.requestId) === input.requestId && uniqueEscortIds.includes(text(response.userId))) {
      effective.set(text(response.userId), response);
    }
  }
  if ([...effective.values()].some((response) => response.responseStatus === 'interested' || response.responseStatus === 'joining')) {
    return { ok: false, status: 409, error: '選擇的人員中有人已經安排過這個局' };
  }

  const now = (input.now ?? new Date()).toISOString();
  const creatorId = text(request.creatorId);
  if (!creatorId) return { ok: false, status: 409, error: '局資料不完整，請重新整理後再試' };

  const responses = uniqueEscortIds.map((escortId) => {
    const previous = effective.get(escortId);
    return previous
      ? { ...previous, responseStatus: 'interested', createdAt: now, dispatcherId: input.session.userId }
      : {
          id: `rr-dispatch-${crypto.randomUUID()}`,
          requestId: input.requestId,
          userId: escortId,
          responseStatus: 'interested',
          createdAt: now,
          dispatcherId: input.session.userId,
        };
  });
  const updates = uniqueEscortIds.map((escortId) => ({
    id: `ue-dispatch-${crypto.randomUUID()}`,
    userId: creatorId,
    actorId: escortId,
    eventType: 'response_received',
    refRequestId: input.requestId,
    createdAt: now,
    read: false,
  }));

  return { ok: true, requestId: input.requestId, responses, updates };
}
