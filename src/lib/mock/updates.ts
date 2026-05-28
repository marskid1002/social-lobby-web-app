import type { UpdateEvent, Follow } from './types';

const now = () => Date.now();
const minsAgo = (m: number) => new Date(now() - m * 60_000).toISOString();

// Notification feed events targeted at the demo user (u-001).
export const updates: UpdateEvent[] = [
  // 蔡佳蓉 joined u-001's request
  {
    id: 'ue-join-001',
    userId: 'u-001',
    actorId: 'u-009',
    eventType: 'response_received',
    refRequestId: 'r-u001-1',
    createdAt: minsAgo(15),
    read: false,
  },
  // View milestone on r-u001-1 (reached 10 views)
  {
    id: 'ue-milestone-001',
    userId: 'u-001',
    actorId: 'u-001',
    eventType: 'milestone_views',
    refRequestId: 'r-u001-1',
    milestoneCount: 10,
    createdAt: minsAgo(25),
    read: false,
  },
  // Plaza reply: 陳怡安 replied to u-001's comment on mp-001
  {
    id: 'ue-plaza-001',
    userId: 'u-001',
    actorId: 'u-005',
    eventType: 'plaza_reply',
    refPostId: 'mp-001',
    createdAt: minsAgo(50),
    read: false,
  },
  {
    id: 'ue-op-001',
    userId: 'u-018',
    actorId: 'u-017',
    eventType: 'invite_received',
    refRequestId: 'r-009',
    createdAt: minsAgo(3),
    read: false,
  },
  {
    id: 'ue-op-002',
    userId: 'u-018',
    actorId: 'u-012',
    eventType: 'invite_received',
    refRequestId: 'r-010',
    createdAt: minsAgo(10),
    read: false,
  },
  {
    id: 'ue-op-003',
    userId: 'u-018',
    actorId: 'u-005',
    eventType: 'invite_received',
    refRequestId: 'r-011',
    createdAt: minsAgo(2),
    read: false,
  },
];

// Demo user follows these people — drives the Following lobby tab.
export const follows: Follow[] = [
  { id: 'f-001', followerId: 'u-001', followingId: 'u-002', createdAt: minsAgo(5000) },
  { id: 'f-002', followerId: 'u-001', followingId: 'u-005', createdAt: minsAgo(4000) },
  { id: 'f-003', followerId: 'u-001', followingId: 'u-008', createdAt: minsAgo(3000) },
  { id: 'f-004', followerId: 'u-001', followingId: 'u-011', createdAt: minsAgo(2000) },
  { id: 'f-005', followerId: 'u-001', followingId: 'u-015', createdAt: minsAgo(1000) },
];
