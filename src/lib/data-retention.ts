import { CHAT_LIFETIME_MS } from './chat-lifetime';
import { directInvitationThreadId } from './chat-authz';
import type { SharedKey, SharedState } from './sync-store';

type Item = { id: string; [key: string]: unknown };

export const REQUEST_ACTIVE_MS = 2 * 60 * 60 * 1000;
export const REQUEST_RETENTION_MS = 8 * 60 * 60 * 1000;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const dateMs = (value: unknown): number | undefined => {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

function invitationRemovalAt(invitation: Item): number | undefined {
  if (invitation.status === 'accepted') {
    const explicit = dateMs(invitation.chatExpiresAt);
    if (explicit !== undefined) return explicit;
    const openedAt = dateMs(invitation.respondedAt) ?? dateMs(invitation.createdAt);
    return openedAt === undefined ? undefined : openedAt + CHAT_LIFETIME_MS;
  }
  const createdAt = dateMs(invitation.createdAt);
  return createdAt === undefined ? undefined : createdAt + REQUEST_RETENTION_MS;
}

function invitationThreadId(invitation: Item): string {
  return text(invitation.groupThreadId) ?? directInvitationThreadId(invitation);
}

export interface RetentionPlan {
  state: SharedState;
  remove: Partial<Record<SharedKey, string[]>>;
}

/** 局／未成立邀請保留 8 小時；已建立聊天室保留至 server 的 chatExpiresAt。 */
export function planDataRetention(all: SharedState, now: number = Date.now()): RetentionPlan {
  const removed: Partial<Record<SharedKey, Set<string>>> = {};
  const mark = (key: SharedKey, item: Item) => {
    (removed[key] ??= new Set()).add(item.id);
  };

  const requests = all.requests.filter((request) => {
    const createdAt = dateMs(request.createdAt);
    const keep = createdAt === undefined || now < createdAt + REQUEST_RETENTION_MS;
    if (!keep) mark('requests', request);
    return keep;
  });
  const retainedRequestIds = new Set(requests.map((request) => request.id));

  const invitations = all.invitations.filter((invitation) => {
    const removeAt = invitationRemovalAt(invitation);
    const keep = removeAt === undefined || now < removeAt;
    if (!keep) mark('invitations', invitation);
    return keep;
  });
  const retainedInvitationIds = new Set(invitations.map((invitation) => invitation.id));
  const activeChatRequestIds = new Set(
    invitations.filter((invitation) => invitation.status === 'accepted')
      .map((invitation) => text(invitation.requestId))
      .filter((requestId): requestId is string => Boolean(requestId)),
  );
  const activeChatThreads = new Set(
    invitations.filter((invitation) => invitation.status === 'accepted')
      .map(invitationThreadId).filter(Boolean),
  );
  const expiredChatThreads = new Set(
    all.invitations
      .filter((invitation) => invitation.status === 'accepted' && !retainedInvitationIds.has(invitation.id))
      .map(invitationThreadId).filter(Boolean),
  );

  const responses = all.responses.filter((response) => {
    const requestId = text(response.requestId);
    const keep = !requestId || retainedRequestIds.has(requestId) || activeChatRequestIds.has(requestId);
    if (!keep) mark('responses', response);
    return keep;
  });
  const updates = all.updates.filter((update) => {
    const requestId = text(update.refRequestId);
    const keep = !requestId || retainedRequestIds.has(requestId);
    if (!keep) mark('updates', update);
    return keep;
  });
  const chatMessages = all.chatMessages.filter((message) => {
    const threadId = text(message.threadId);
    const createdAt = dateMs(message.createdAt);
    const keep = threadId
      ? activeChatThreads.has(threadId) || (!expiredChatThreads.has(threadId) && (createdAt === undefined || now < createdAt + CHAT_LIFETIME_MS))
      : createdAt === undefined || now < createdAt + CHAT_LIFETIME_MS;
    if (!keep) mark('chatMessages', message);
    return keep;
  });
  const chatReads = all.chatReads.filter((read) => {
    const threadId = text(read.threadId);
    const lastReadAt = dateMs(read.lastReadAt);
    const keep = threadId
      ? activeChatThreads.has(threadId) || (!expiredChatThreads.has(threadId) && (lastReadAt === undefined || now < lastReadAt + CHAT_LIFETIME_MS))
      : lastReadAt === undefined || now < lastReadAt + CHAT_LIFETIME_MS;
    if (!keep) mark('chatReads', read);
    return keep;
  });

  return {
    state: { ...all, requests, responses, invitations, updates, chatMessages, chatReads },
    remove: Object.fromEntries(
      Object.entries(removed).map(([key, ids]) => [key, [...ids]]),
    ) as Partial<Record<SharedKey, string[]>>,
  };
}
