import type { SessionPayload } from './session';

type Item = { id: string; [key: string]: unknown };

export interface AcceptMatchInput {
  session: SessionPayload;
  responseId: string;
  requests: Item[];
  responses: Item[];
  invitations: Item[];
  now?: number;
}

export type AcceptMatchResult =
  | { ok: false; status: 400 | 403 | 404 | 409; error: string }
  | {
      ok: true;
      response: Item;
      invitation: Item;
      update?: Item;
      partnerUserId: string;
      requestId: string;
      alreadyAccepted: boolean;
    };

const str = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const stableSuffix = (value: string): string => {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x85ebca6b);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
};

/**
 * 由 server stored 資料規劃「接受入局」結果。此函式不做 I/O：
 * - 只有局主可接受。
 * - response 身份欄位一律沿用 server 版本。
 * - 幹部派工時，聊天室對象固定為 dispatcherId。
 * - 重複請求具冪等性；若 response 已 joining 但 invitation 曾漏寫，會補建 invitation。
 */
export function planAcceptMatch(input: AcceptMatchInput): AcceptMatchResult {
  const responseId = input.responseId.trim();
  if (!responseId || responseId.length > 128) {
    return { ok: false, status: 400, error: 'invalid responseId' };
  }

  const storedResponse = input.responses.find((item) => item.id === responseId);
  if (!storedResponse) {
    return { ok: false, status: 404, error: 'response not found' };
  }

  const requestId = str(storedResponse.requestId);
  const request = input.requests.find((item) => item.id === requestId);
  if (!request) {
    return { ok: false, status: 404, error: 'request not found' };
  }
  if (str(request.creatorId) !== input.session.userId) {
    return { ok: false, status: 403, error: 'forbidden' };
  }

  const currentStatus = str(storedResponse.responseStatus);
  if (currentStatus !== 'interested' && currentStatus !== 'joining') {
    return { ok: false, status: 409, error: 'response is not awaiting acceptance' };
  }

  const partnerUserId = str(storedResponse.dispatcherId) || str(storedResponse.userId);
  if (!partnerUserId || partnerUserId === input.session.userId) {
    return { ok: false, status: 409, error: 'invalid chat partner' };
  }

  const existingInvitation = input.invitations.find((item) =>
    item.requestId === requestId
    && item.fromUserId === partnerUserId
    && item.toUserId === input.session.userId
    && item.status === 'accepted'
    && item.meetupConfirmed !== true
  );
  const response: Item = currentStatus === 'joining'
    ? storedResponse
    : { ...storedResponse, responseStatus: 'joining' };

  if (existingInvitation) {
    return {
      ok: true,
      response,
      invitation: existingInvitation,
      partnerUserId,
      requestId,
      alreadyAccepted: true,
    };
  }

  const now = input.now ?? Date.now();
  const iso = new Date(now).toISOString();
  const chatExpiresAt = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  // 以 responseId 產生穩定 id：雙擊、重試或兩台裝置同時接受也只會 upsert 同一筆。
  const suffix = stableSuffix(responseId);
  const invitation: Item = {
    id: `i-accept-${suffix}`,
    requestId,
    fromUserId: partnerUserId,
    toUserId: input.session.userId,
    status: 'accepted',
    createdAt: iso,
    respondedAt: iso,
    chatExpiresAt,
    ...(str(storedResponse.dispatcherId)
      ? { dispatcherId: str(storedResponse.dispatcherId) }
      : {}),
  };
  const update: Item = {
    id: `ue-accept-${suffix}`,
    userId: partnerUserId,
    actorId: input.session.userId,
    eventType: 'invite_accepted',
    refRequestId: requestId,
    createdAt: iso,
    read: false,
  };

  return {
    ok: true,
    response,
    invitation,
    update,
    partnerUserId,
    requestId,
    alreadyAccepted: false,
  };
}
