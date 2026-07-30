import type { SessionPayload } from './session';
import { recordFlowTrace } from './flow-trace-store';

type Item = { id: string; [key: string]: unknown };

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

export async function recordAcceptedSyncWrites(input: {
  patch: Record<string, unknown>;
  existing: Record<string, Item[]>;
  session: SessionPayload;
}): Promise<void> {
  const jobs: Array<Promise<unknown>> = [];
  const existingIds = (key: string) =>
    new Set((input.existing[key] ?? []).map((item) => item.id));

  const requestIds = existingIds('requests');
  for (const item of Array.isArray(input.patch.requests) ? input.patch.requests as Item[] : []) {
    if (requestIds.has(item.id)) continue;
    jobs.push(recordFlowTrace({
      eventType: 'request.created',
      actorUserId: input.session.userId,
      requestId: item.id,
      entityId: item.id,
      dedupeKey: `request.created:${item.id}`,
    }));
  }

  const responseIds = existingIds('responses');
  for (const item of Array.isArray(input.patch.responses) ? input.patch.responses as Item[] : []) {
    if (responseIds.has(item.id)) continue;
    const requestId = text(item.requestId);
    if (!requestId) continue;
    jobs.push(recordFlowTrace({
      eventType: text(item.dispatcherId) ? 'dispatch.created' : 'response.created',
      actorUserId: input.session.userId,
      requestId,
      entityId: item.id,
      dedupeKey: `response.created:${item.id}`,
    }));
  }

  const invitationIds = existingIds('invitations');
  for (const item of Array.isArray(input.patch.invitations) ? input.patch.invitations as Item[] : []) {
    if (invitationIds.has(item.id) || item.status !== 'accepted') continue;
    const requestId = text(item.requestId);
    if (!requestId) continue;
    jobs.push(recordFlowTrace({
      eventType: 'chat.created',
      actorUserId: input.session.userId,
      requestId,
      threadId: text(item.chatThreadId) || text(item.groupThreadId) || undefined,
      entityId: item.id,
      dedupeKey: `chat.created:${item.id}`,
    }));
  }

  const messageIds = existingIds('chatMessages');
  for (const item of Array.isArray(input.patch.chatMessages) ? input.patch.chatMessages as Item[] : []) {
    if (messageIds.has(item.id)) continue;
    const requestId = text(item.requestId);
    jobs.push(recordFlowTrace({
      eventType: 'message.stored',
      actorUserId: input.session.userId,
      requestId: requestId || undefined,
      threadId: text(item.threadId) || undefined,
      entityId: item.id,
      detail: text(item.imageUrl) ? 'image' : 'text',
      dedupeKey: `message.stored:${item.id}`,
    }));
  }

  await Promise.all(jobs);
}
