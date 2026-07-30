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

export type Tier = 'guest' | 'free' | 'standard' | 'premium' | 'vip';

export type Role = 'user' | 'escort' | 'manager' | 'operator' | 'admin';

export type UpdateEventType =
  | 'response_received'
  | 'invite_received'
  | 'invite_accepted'
  | 'follow'
  | 'status_change'
  | 'request_closed'
  | 'milestone_views'   // request reached a view count milestone
  | 'plaza_reply'       // someone replied to your plaza comment
  | 'request_posted';   // a new request was posted (notifies managers)

export interface User {
  id: string;
  lineUserId: string;
  nickname: string;
  avatarUrl: string;
  cardImageUrl?: string;     // Full-bleed card/hero background photo
  bio: string;
  defaultArea: string;
  interests: string[];
  tier: Tier;
  role: Role;
  credits: number;
  monthlyRequestsLeft: number;  // resets monthly; VIP seeded at 999 (unlimited)
  lineOAFollowed: boolean;
  createdAt: string;         // ISO
  following?: string[];
  managerId?: string;        // 幹部自建的小姐所屬的幹部 userId（B：人員由幹部自建）
}

export interface OnlineStatus {
  userId: string;
  status: Status;
  area: string;
  lastSeen: string;          // ISO — "last online time"
  expiresAt: string;         // ISO
}

export interface RequestMetrics {
  impressions: number;
  views: number;
  joins: number;
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
  metrics?: RequestMetrics;
  /** User IDs who opened the detail page but did NOT submit a join response. Used for FOMO display only. */
  requestViewers?: string[];
}

export interface Response {
  id: string;
  requestId: string;
  userId: string;
  responseStatus: ResponseStatus;
  note?: string;
  createdAt: string;         // ISO
  dispatcherId?: string;     // 若為幹部派工，記錄派工幹部 id（客戶接受後由幹部代談）
}

export interface Invitation {
  id: string;
  requestId: string | null;
  responseId?: string;       // 接受哪一筆加入／派工；每位小姐各自綁定一筆
  fromUserId: string;
  toUserId: string;
  status: InvitationStatus;
  message?: string;
  createdAt: string;         // ISO
  respondedAt?: string;
  chatExpiresAt?: string;    // ISO — 48h after server acceptance; chat locks after this
  meetupConfirmed?: boolean; // true once user confirms the meetup happened
  groupThreadId?: string;    // set for group requests (g-{requestId}); null for 1:1
  chatThreadId?: string;     // 每筆派工的獨立聊天室；舊資料未設定時沿用雙方 canonical thread
  dispatcherId?: string;     // 若聊天對象是代談幹部，記錄該幹部 id
  managerDecision?: 'confirmed' | 'declined';
  managerDecisionBy?: string;
  managerDecisionAt?: string;
}

export interface MeetRecord {
  userId: string;            // the person you met
  metAt: string;             // ISO
  expiresAt: string;         // ISO — metAt + 7 days; UI filters records past this
}

export interface UpdateEvent {
  id: string;
  userId: string;            // recipient
  actorId: string;
  eventType: UpdateEventType;
  refRequestId?: string;
  refPostId?: string;        // for plaza_reply events
  milestoneCount?: number;   // for milestone_views events
  createdAt: string;         // ISO
  read?: boolean;
}

export interface Follow {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
}

export interface MomentPost {
  id: string;
  authorId: string;
  content: string;
  imageUrl?: string;
  likeCount: number;
  commentCount: number;
  createdAt: string; // ISO
}

// 廣場留言（跨裝置同步）；parentId 有值代表是某則留言的回覆
export interface PlazaComment {
  id: string;
  postId: string;
  userId: string;
  text: string;
  parentId?: string;
  createdAt: string; // ISO
}

export interface DirectMessage {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string;
  requestType?: string;
  area?: string;
  note?: string;
  createdAt: string;
  read: boolean;
}

export interface ChatMessage {
  id: string;
  threadId: string;   // 新派工使用 invitation.chatThreadId；舊 1:1 使用雙方 canonical thread
  senderId: string;
  text: string;
  imageUrl?: string;  // 照片訊息：Blob 圖片網址（有圖時 text 可為空）
  requestId?: string; // 代談：綁定的局 id，用來把「同幹部同客戶、不同局」的對話分開（次要過濾，不改 threadId）
  createdAt: string;
}
