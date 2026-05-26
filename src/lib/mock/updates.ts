import type { UpdateEvent, Follow } from './types';

const now = () => Date.now();
const minsAgo = (m: number) => new Date(now() - m * 60_000).toISOString();

// Updates feed events targeted at the demo user (u-001).
export const updates: UpdateEvent[] = [
  {
    id: 'ue-001',
    userId: 'u-001',
    actorId: 'u-002',
    eventType: 'invite_received',
    refRequestId: 'r-008',
    createdAt: minsAgo(12),
    read: false,
  },
  {
    id: 'ue-002',
    userId: 'u-001',
    actorId: 'u-015',
    eventType: 'invite_received',
    refRequestId: 'r-004',
    createdAt: minsAgo(40),
    read: false,
  },
  {
    id: 'ue-003',
    userId: 'u-001',
    actorId: 'u-005',
    eventType: 'follow',
    createdAt: minsAgo(120),
    read: true,
  },
  {
    id: 'ue-004',
    userId: 'u-001',
    actorId: 'u-008',
    eventType: 'status_change',
    createdAt: minsAgo(180),
    read: true,
  },
  {
    id: 'ue-005',
    userId: 'u-001',
    actorId: 'u-011',
    eventType: 'follow',
    createdAt: minsAgo(240),
    read: true,
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
