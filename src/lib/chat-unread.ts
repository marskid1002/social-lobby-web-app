import type { ChatMessage, ChatRead } from './mock';

export function chatReadFor(
  reads: ChatRead[],
  userId: string,
  threadId: string,
  requestId?: string | null,
): ChatRead | undefined {
  return reads.find((read) =>
    read.userId === userId
    && read.threadId === threadId
    && (read.requestId ?? null) === (requestId ?? null)
  );
}

export function unreadMessagesFor(
  messages: ChatMessage[],
  reads: ChatRead[],
  userId: string,
  threadId: string,
  requestId?: string | null,
): ChatMessage[] {
  const read = chatReadFor(reads, userId, threadId, requestId);
  const lastReadAt = read ? Date.parse(read.lastReadAt) : 0;

  return messages.filter((message) =>
    message.threadId === threadId
    && (message.requestId ?? null) === (requestId ?? null)
    && message.senderId !== userId
    && Date.parse(message.createdAt) > lastReadAt
  );
}

export function totalUnreadMessages(
  messages: ChatMessage[],
  reads: ChatRead[],
  userId: string,
): number {
  return messages.filter((message) => {
    if (message.senderId === userId) return false;
    const read = chatReadFor(reads, userId, message.threadId, message.requestId);
    return Date.parse(message.createdAt) > (read ? Date.parse(read.lastReadAt) : 0);
  }).length;
}
