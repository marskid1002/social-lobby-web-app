import type { ChatMessage, ChatRead, Invitation, Request, Response } from './mock';
import { unreadMessagesFor } from './chat-unread';

type AttendanceInvitation = Invitation & {
  meetupEndedAt?: string;
};

export function newRequestAttentionKeys(
  requests: Request[],
  responses: Response[],
  managerId: string,
  now = Date.now(),
): string[] {
  if (!managerId) return [];
  return requests
    .filter((request) =>
      request.creatorId !== managerId
      && request.status === 'open'
      && Date.parse(request.expiresAt) > now
      && !responses.some((response) =>
        response.requestId === request.id && response.dispatcherId === managerId
      )
    )
    .map((request) => `request:${request.id}`);
}

export function unreadChatAttentionKeys(
  messages: ChatMessage[],
  reads: ChatRead[],
  userId: string,
): string[] {
  if (!userId) return [];
  const conversations = new Set(
    messages
      .filter((message) => message.senderId !== userId)
      .map((message) => `${message.threadId}\u0000${message.requestId ?? ''}`),
  );
  const keys: string[] = [];
  for (const conversation of conversations) {
    const [threadId, requestId] = conversation.split('\u0000');
    if (unreadMessagesFor(messages, reads, userId, threadId, requestId || undefined).length > 0) {
      keys.push(`chat:${threadId}:${requestId}`);
    }
  }
  return keys;
}

export function pendingAttendanceAttentionKeys(
  invitations: AttendanceInvitation[],
  managerId: string,
  now = Date.now(),
): string[] {
  if (!managerId) return [];
  return invitations
    .filter((invitation) =>
      invitation.status === 'accepted'
      && invitation.dispatcherId === managerId
      && invitation.fromUserId === managerId
      && !invitation.managerDecision
      && invitation.meetupConfirmed !== true
      && !invitation.meetupEndedAt
      && Date.parse(invitation.chatExpiresAt ?? '') > now
    )
    .map((invitation) => `attendance:${invitation.id}`);
}

export function uniqueAttentionKeys(...groups: string[][]): string[] {
  return [...new Set(groups.flat().filter(Boolean))];
}
