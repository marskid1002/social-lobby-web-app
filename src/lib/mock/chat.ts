import type { ChatMessage } from './types';

// No pre-seeded messages — chat starts fresh for each new invite session
export const seedChatMessages: ChatMessage[] = [];

// Teaser messages — girls showing interest without a full invite
// These appear in the inbox as read-only "teasers", not actionable invites
export interface TeaserMessage {
  id: string;
  fromUserId: string;
  toUserId: string;   // always the demo user u-001
  text: string;
  createdAt: string;
}

export const seedTeaserMessages: TeaserMessage[] = [
  {
    id: 'tm-001',
    fromUserId: 'u-005',
    toUserId: 'u-001',
    text: '今晚有空嗎？👀',
    createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  },
  {
    id: 'tm-002',
    fromUserId: 'u-009',
    toUserId: 'u-001',
    text: '信義區有個局，差一個人 🍻',
    createdAt: new Date(Date.now() - 28 * 60_000).toISOString(),
  },
  {
    id: 'tm-003',
    fromUserId: 'u-003',
    toUserId: 'u-001',
    text: '你的需求看起來很有趣，可以聊聊嗎？✨',
    createdAt: new Date(Date.now() - 45 * 60_000).toISOString(),
  },
];
