// Shared TypeScript types for mock data.

export type Status = 'available' | 'fill_spot' | 'bring_people' | 'busy';

export type RequestType =
  | 'after_party'
  | 'drinking'
  | 'fill_spot'
  | 'last_minute'
  | 'other';

export type RequestStatus = 'open' | 'closed' | 'cancelled' | 'expired';

export type ResponseStatus = 'interested' | 'joining' | 'declined' | 'withdrawn';

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export type Tier = 'free' | 'pro' | 'vip';

export type Role = 'user' | 'operator' | 'admin';

export type UpdateEventType =
  | 'response_received'
  | 'invite_received'
  | 'follow'
  | 'status_change'
  | 'request_closed';

export interface User {
  id: string;
  lineUserId: string;
  nickname: string;
  avatarUrl: string;        // Use https://i.pravatar.cc/150?u=<id> as deterministic placeholder
  bio: string;
  defaultArea: string;
  interests: string[];
  tier: Tier;
  role: Role;
  credits: number;
  lineOAFollowed: boolean;
  createdAt: string;         // ISO
}

export interface OnlineStatus {
  userId: string;
  status: Status;
  area: string;
  lastSeen: string;          // ISO — "last online time"
  expiresAt: string;         // ISO
}

export interface Request {
  id: string;
  creatorId: string;
  area: string;
  requestType: RequestType;
  peopleCount: number;
  note: string;
  status: RequestStatus;
  createdAt: string;         // ISO
  expiresAt: string;         // ISO
}

export interface Response {
  id: string;
  requestId: string;
  userId: string;
  responseStatus: ResponseStatus;
  note?: string;
  createdAt: string;         // ISO
}

export interface Invitation {
  id: string;
  requestId: string | null;
  fromUserId: string;
  toUserId: string;
  status: InvitationStatus;
  message?: string;
  createdAt: string;         // ISO
  respondedAt?: string;
}

export interface UpdateEvent {
  id: string;
  userId: string;            // recipient
  actorId: string;
  eventType: UpdateEventType;
  refRequestId?: string;
  createdAt: string;         // ISO
  read?: boolean;
}

export interface Follow {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
}
