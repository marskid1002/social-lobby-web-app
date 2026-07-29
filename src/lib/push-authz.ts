import type { SessionPayload } from './session';
import { sendWebPushToUsers, type PushResult } from './push-service';
import { recordFlowTrace } from './flow-trace-store';

type Item = { id: string; [key: string]: unknown };

export type AuthorizedPushKind = 'request' | 'response' | 'invitation';

export interface AuthorizedPushJob {
  kind: AuthorizedPushKind;
  entityId: string;
  requestId?: string;
  userIds: string[];
  title: string;
  body: string;
  url: string;
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const collection = (patch: Record<string, unknown>, key: string): Item[] =>
  Array.isArray(patch[key]) ? patch[key] as Item[] : [];

/**
 * 只接收 authorizeWrites 已核准的 patch，並再以 session 與 server existing
 * 做防禦性檢查。收件人、標題、內容與網址全部由 server 重建。
 */
export function planAuthorizedSyncPushes(input: {
  patch: Record<string, unknown>;
  existing: Record<string, Item[]>;
  managerUserIds: string[];
  session: SessionPayload;
}): AuthorizedPushJob[] {
  const me = input.session.userId;
  const jobs: AuthorizedPushJob[] = [];
  const existingById = (key: string) =>
    new Map((input.existing[key] ?? []).map((item) => [item.id, item]));

  const existingRequests = existingById('requests');
  const effectiveRequests = new Map(existingRequests);
  for (const request of collection(input.patch, 'requests')) {
    effectiveRequests.set(request.id, request);
    if (existingRequests.has(request.id) || text(request.creatorId) !== me) continue;
    const managerIds = [...new Set(input.managerUserIds)]
      .filter((userId) => userId && userId !== me);
    if (managerIds.length === 0) continue;
    jobs.push({
      kind: 'request',
      entityId: request.id,
      requestId: request.id,
      userIds: managerIds,
      title: '有新的局邀請',
      body: '有新的局發布，快安排出席',
      url: '/lobby/explore',
    });
  }

  const existingResponses = existingById('responses');
  for (const response of collection(input.patch, 'responses')) {
    const previous = existingResponses.get(response.id);
    const statusBecameInterested =
      text(response.responseStatus) === 'interested'
      && (!previous || text(previous.responseStatus) !== 'interested');
    if (!statusBecameInterested) continue;
    const ownedByCaller =
      text(response.userId) === me
      || text(response.dispatcherId) === me;
    if (!ownedByCaller) continue;
    const requestId = text(response.requestId);
    const creatorId = text(effectiveRequests.get(requestId)?.creatorId);
    if (!requestId || !creatorId || creatorId === me) continue;
    jobs.push({
      kind: 'response',
      entityId: response.id,
      requestId,
      userIds: [creatorId],
      title: '有人想加入你的局',
      body: '有人對你的需求感興趣',
      url: `/requests/${encodeURIComponent(requestId)}`,
    });
  }

  const existingInvitations = existingById('invitations');
  for (const invitation of collection(input.patch, 'invitations')) {
    if (
      existingInvitations.has(invitation.id)
      || text(invitation.fromUserId) !== me
      || text(invitation.status) !== 'pending'
    ) {
      continue;
    }
    const recipientId = text(invitation.toUserId);
    if (!recipientId || recipientId === me) continue;
    jobs.push({
      kind: 'invitation',
      entityId: invitation.id,
      requestId: text(invitation.requestId) || undefined,
      userIds: [recipientId],
      title: '你收到一則邀請',
      body: text(invitation.requestId) ? '有人傳送了邀請' : '有人傳送了私人邀請',
      url: '/inbox',
    });
  }

  return jobs;
}

export async function deliverAuthorizedPushes(
  jobs: AuthorizedPushJob[],
  session: SessionPayload,
): Promise<void> {
  await Promise.all(jobs.map(async (job) => {
    const result: PushResult = await sendWebPushToUsers(
      job.userIds,
      job.title,
      job.body,
      job.url,
    ).catch((error) => {
      console.error('[authorized sync push]', error instanceof Error ? error.name : 'UnknownError');
      return { sent: 0, total: 0, skipped: 'push error' };
    });

    await recordFlowTrace({
      eventType: `${job.kind}.push`,
      outcome: result.sent > 0 ? 'success' : 'skipped',
      actorUserId: session.userId,
      requestId: job.requestId,
      entityId: job.entityId,
      code: result.skipped,
      detail: `sent=${result.sent};total=${result.total ?? 0}`,
      dedupeKey: `${job.kind}.push:${job.entityId}`,
    }).catch((error) => {
      console.error('[authorized sync push trace]', error instanceof Error ? error.name : 'UnknownError');
    });
  }));
}
