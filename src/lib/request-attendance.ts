type AttendanceResponse = {
  id: string;
  requestId?: unknown;
  userId?: unknown;
};

type AttendanceInvitation = {
  id: string;
  requestId?: unknown;
  responseId?: unknown;
  status?: unknown;
  managerDecision?: unknown;
  meetupConfirmed?: unknown;
  meetupEndedAt?: unknown;
  chatExpiresAt?: unknown;
};

type AttendanceRequest = {
  id: string;
  status?: unknown;
  peopleCount?: unknown;
  [key: string]: unknown;
};

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const isConfirmed = (invitation: AttendanceInvitation): boolean =>
  invitation.status === 'accepted'
  && invitation.managerDecision !== 'declined'
  && (
    invitation.managerDecision === 'confirmed'
    || invitation.meetupConfirmed === true
  );

export function confirmedGirlIdsForRequest(
  requestId: string,
  responses: AttendanceResponse[],
  invitations: AttendanceInvitation[],
): string[] {
  const responseById = new Map(responses.map((response) => [response.id, response]));
  const confirmed = new Set<string>();

  for (const invitation of invitations) {
    if (text(invitation.requestId) !== requestId || !isConfirmed(invitation)) continue;
    const response = responseById.get(text(invitation.responseId));
    if (!response || text(response.requestId) !== requestId) continue;
    const girlId = text(response.userId);
    if (girlId) confirmed.add(girlId);
  }

  return [...confirmed];
}

export function confirmedCountForRequest(
  requestId: string,
  responses: AttendanceResponse[],
  invitations: AttendanceInvitation[],
): number {
  return confirmedGirlIdsForRequest(requestId, responses, invitations).length;
}

export function activeConfirmedGirlIds(
  responses: AttendanceResponse[],
  invitations: AttendanceInvitation[],
  now: number = Date.now(),
): Set<string> {
  const responseById = new Map(responses.map((response) => [response.id, response]));
  const busy = new Set<string>();

  for (const invitation of invitations) {
    if (!isConfirmed(invitation)) continue;
    if (text(invitation.meetupEndedAt)) continue;
    const expiresAt = Date.parse(text(invitation.chatExpiresAt));
    if (Number.isFinite(expiresAt) && expiresAt <= now) continue;
    const response = responseById.get(text(invitation.responseId));
    const girlId = text(response?.userId);
    if (girlId) busy.add(girlId);
  }

  return busy;
}

export function filledRequestClosures<T extends AttendanceRequest>(
  requests: T[],
  responses: AttendanceResponse[],
  invitations: AttendanceInvitation[],
): T[] {
  return requests.flatMap((request) => {
    if (request.status !== 'open') return [];
    const peopleCount = Number(request.peopleCount);
    if (!Number.isInteger(peopleCount) || peopleCount < 1) return [];
    const confirmed = confirmedCountForRequest(request.id, responses, invitations);
    return confirmed >= peopleCount
      ? [{ ...request, status: 'closed' } as T]
      : [];
  });
}
