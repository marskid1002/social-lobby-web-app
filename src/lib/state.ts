'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  users as seedUsers,
  onlineStatuses as seedOnlineStatuses,
  requests as seedRequests,
  responses as seedResponses,
  invitations as seedInvitations,
  updates as seedUpdates,
  follows as seedFollows,
  seedChatMessages,
  seedTeaserMessages,
  momentPosts as seedMomentPosts,
} from '@/lib/mock';
import type { User, OnlineStatus, Request, Response, Invitation, UpdateEvent, Follow, ChatMessage, DirectMessage, MeetRecord, MomentPost } from '@/lib/mock';
import type { TeaserMessage } from '@/lib/mock/chat';

const STORAGE_KEY = 'sl_state_v3';
const PRIVATE_INVITE_CREDIT_COST = 3;
const EXTRA_SLOT_CREDIT_COST = 35;

export const TIER_MONTHLY_LIMITS: Record<string, number> = {
  free: 3,
  standard: 5,
  premium: 10,
  vip: 999,
};

export const TIER_SLOT_CAPS: Record<string, number> = {
  free: 1,
  standard: 3,
  premium: 5,
  vip: 999,
};

export interface AppState {
  currentUserId: string;
  onlineUserIds: string[];
  users: User[];
  onlineStatuses: OnlineStatus[];
  requests: Request[];
  responses: Response[];
  invitations: Invitation[];
  updates: UpdateEvent[];
  follows: Follow[];
  readUpdateIds: string[];
  userBlocks: string[];
  notificationsEnabled: boolean;
  showOnNearby: boolean;
  autoOfflineHours: number;
  chatMessages: ChatMessage[];
  directMessages: DirectMessage[];
  meetRecords: MeetRecord[];
  teaserMessages: TeaserMessage[];
  inboxUnread: boolean;      // true when a new accepted invite is waiting in inbox
  momentPosts: MomentPost[];
  likedPostIds: string[];
}

function getSeedState(): AppState {
  return {
    currentUserId: 'u-001',
    onlineUserIds: seedOnlineStatuses.map((s) => s.userId),
    users: seedUsers,
    onlineStatuses: seedOnlineStatuses,
    requests: seedRequests,
    responses: seedResponses,
    invitations: seedInvitations,
    updates: seedUpdates,
    follows: seedFollows,
    readUpdateIds: seedUpdates.filter((u) => u.read).map((u) => u.id),
    userBlocks: [],
    notificationsEnabled: true,
    showOnNearby: true,
    autoOfflineHours: 4,
    chatMessages: seedChatMessages,
    directMessages: [],
    meetRecords: [],
    teaserMessages: seedTeaserMessages,
    inboxUnread: false,
    momentPosts: seedMomentPosts,
    likedPostIds: [],
  };
}

function loadState(): AppState {
  if (typeof window === 'undefined') return getSeedState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getSeedState();
    const parsed = JSON.parse(raw);
    return { ...getSeedState(), ...parsed };
  } catch {
    return getSeedState();
  }
}

function saveState(state: AppState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function resetState() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('sl_onboarded');
}

let globalState: AppState | null = null;
const listeners = new Set<() => void>();

function getState(): AppState {
  if (!globalState) {
    globalState = loadState();
  }
  return globalState;
}

function setState(updater: (prev: AppState) => AppState) {
  const next = updater(getState());
  globalState = next;
  saveState(next);
  listeners.forEach((l) => l());
}

export function useAppState() {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const state = getState();

  const currentUser = state.users.find((u) => u.id === state.currentUserId) ?? state.users[0];

  const isOnline = state.onlineUserIds.includes(state.currentUserId);

  const currentOnlineStatus = state.onlineStatuses.find((s) => s.userId === state.currentUserId);

  const unreadCount = state.updates.filter(
    (u) => u.userId === state.currentUserId && !state.readUpdateIds.includes(u.id)
  ).length;

  const switchUser = useCallback((userId: string) => {
    setState((prev) => ({ ...prev, currentUserId: userId }));
  }, []);

  const setOnline = useCallback((online: boolean) => {
    setState((prev) => {
      const onlineUserIds = online
        ? [...new Set([...prev.onlineUserIds, prev.currentUserId])]
        : prev.onlineUserIds.filter((id) => id !== prev.currentUserId);

      let onlineStatuses = prev.onlineStatuses;
      if (online && !prev.onlineStatuses.find((s) => s.userId === prev.currentUserId)) {
        const user = prev.users.find((u) => u.id === prev.currentUserId);
        onlineStatuses = [
          ...prev.onlineStatuses,
          {
            userId: prev.currentUserId,
            status: 'available',
            area: user?.defaultArea ?? '信義區',
            lastSeen: new Date().toISOString(),
            expiresAt: new Date(Date.now() + prev.autoOfflineHours * 3_600_000).toISOString(),
          },
        ];
      } else if (!online) {
        onlineStatuses = prev.onlineStatuses.filter((s) => s.userId !== prev.currentUserId);
      }

      return { ...prev, onlineUserIds, onlineStatuses };
    });
  }, []);

  const setStatus = useCallback((status: OnlineStatus['status']) => {
    setState((prev) => ({
      ...prev,
      onlineStatuses: prev.onlineStatuses.map((s) =>
        s.userId === prev.currentUserId ? { ...s, status } : s
      ),
    }));
  }, []);

  const setArea = useCallback((area: string) => {
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === prev.currentUserId ? { ...u, defaultArea: area } : u
      ),
      onlineStatuses: prev.onlineStatuses.map((s) =>
        s.userId === prev.currentUserId ? { ...s, area } : s
      ),
    }));
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === prev.currentUserId ? { ...u, ...updates } : u
      ),
    }));
  }, []);

  const postRequest = useCallback((req: Omit<Request, 'id' | 'creatorId' | 'createdAt' | 'expiresAt' | 'status' | 'metrics'>) => {
    const newReq: Request = {
      ...req,
      id: `r-${Date.now()}`,
      creatorId: getState().currentUserId,
      status: 'open',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
      metrics: { impressions: 0, views: 0, joins: 0 },
    };
    setState((prev) => ({
      ...prev,
      requests: [newReq, ...prev.requests],
      users: prev.users.map((u) =>
        u.id === prev.currentUserId
          ? { ...u, monthlyRequestsLeft: Math.max(0, u.monthlyRequestsLeft - 1) }
          : u
      ),
    }));
    return newReq;
  }, []);

  const respondToRequest = useCallback((requestId: string, note?: string) => {
    const newResponse: Response = {
      id: `rr-${Date.now()}`,
      requestId,
      userId: getState().currentUserId,
      responseStatus: 'interested',
      note,
      createdAt: new Date().toISOString(),
    };
    const req = getState().requests.find((r) => r.id === requestId);
    const newUpdate: UpdateEvent = {
      id: `ue-${Date.now()}`,
      userId: req?.creatorId ?? '',
      actorId: getState().currentUserId,
      eventType: 'response_received',
      refRequestId: requestId,
      createdAt: new Date().toISOString(),
      read: false,
    };
    setState((prev) => ({
      ...prev,
      responses: [...prev.responses, newResponse],
      updates: [newUpdate, ...prev.updates],
    }));
  }, []);

  // sendInvite: private invites (requestId=null) cost 3 credits and auto-accept after 1.5s
  const sendInvite = useCallback((toUserId: string, requestId: string | null, message?: string) => {
    const isPrivate = requestId === null;
    const inviteId = `i-${Date.now()}`;
    const newInvite: Invitation = {
      id: inviteId,
      requestId,
      fromUserId: getState().currentUserId,
      toUserId,
      status: 'pending',
      message,
      createdAt: new Date().toISOString(),
    };
    const newUpdate: UpdateEvent = {
      id: `ue-${Date.now()}`,
      userId: toUserId,
      actorId: getState().currentUserId,
      eventType: 'invite_received',
      refRequestId: requestId ?? undefined,
      createdAt: new Date().toISOString(),
      read: false,
    };

    setState((prev) => ({
      ...prev,
      invitations: [...prev.invitations, newInvite],
      updates: [newUpdate, ...prev.updates],
      // Deduct 3 credits for private invites
      users: isPrivate
        ? prev.users.map((u) =>
            u.id === prev.currentUserId ? { ...u, credits: Math.max(0, u.credits - PRIVATE_INVITE_CREDIT_COST) } : u
          )
        : prev.users,
    }));

    // Auto-accept private invites after 1.5s
    if (isPrivate) {
      setTimeout(() => {
        const senderId = getState().currentUserId;
        const chatExpiresAt = new Date(Date.now() + 8 * 3_600_000).toISOString();
        const acceptedUpdate: UpdateEvent = {
          id: `ue-${Date.now()}`,
          userId: senderId,
          actorId: toUserId,
          eventType: 'invite_accepted',
          createdAt: new Date().toISOString(),
          read: false,
        };
        setState((prev) => ({
          ...prev,
          invitations: prev.invitations.map((inv) =>
            inv.id === inviteId
              ? { ...inv, status: 'accepted', respondedAt: new Date().toISOString(), chatExpiresAt }
              : inv
          ),
          updates: [acceptedUpdate, ...prev.updates],
          inboxUnread: true,
        }));
      }, 1500);
    }
  }, []);

  const respondToInvite = useCallback((inviteId: string, accept: boolean) => {
    setState((prev) => ({
      ...prev,
      invitations: prev.invitations.map((i) =>
        i.id === inviteId
          ? {
              ...i,
              status: accept ? 'accepted' : 'declined',
              respondedAt: new Date().toISOString(),
              chatExpiresAt: accept
                ? new Date(Date.now() + 8 * 3_600_000).toISOString()
                : undefined,
            }
          : i
      ),
    }));
  }, []);

  // Only allowed when no active joiners. UI must enforce this guard before calling.
  const closeRequest = useCallback((requestId: string) => {
    setState((prev) => {
      const activeJoiners = prev.responses.filter(
        (r) => r.requestId === requestId && r.responseStatus === 'joining'
      ).length;
      if (activeJoiners > 0) return prev; // blocked — must reject all joiners first
      return {
        ...prev,
        requests: prev.requests.map((r) =>
          r.id === requestId ? { ...r, status: 'closed' } : r
        ),
      };
    });
  }, []);

  // Escort withdraws their 'interested' request before the creator accepts.
  const cancelJoinRequest = useCallback((requestId: string) => {
    setState((prev) => ({
      ...prev,
      responses: prev.responses.map((r) =>
        r.requestId === requestId && r.userId === prev.currentUserId && r.responseStatus === 'interested'
          ? { ...r, responseStatus: 'withdrawn' as const }
          : r
      ),
    }));
  }, []);

  // Escort asks to join: creates an 'interested' response + notifies creator. No invitation yet.
  const joinRequest = useCallback((requestId: string) => {
    const s = getState();
    const request = s.requests.find((r) => r.id === requestId);
    if (!request) return;
    const escortId = s.currentUserId;

    // Guard: don't double-respond (allow re-join after withdrawal by reactivating)
    const existing = s.responses.find(
      (r) => r.requestId === requestId && r.userId === escortId
    );
    if (existing?.responseStatus === 'interested' || existing?.responseStatus === 'joining') return;
    // Reactivate a withdrawn response instead of creating a duplicate
    if (existing?.responseStatus === 'withdrawn') {
      const notif: UpdateEvent = {
        id: `ue-ask-${Date.now()}`,
        userId: request.creatorId,
        actorId: escortId,
        eventType: 'response_received',
        refRequestId: requestId,
        createdAt: new Date().toISOString(),
        read: false,
      };
      setState((prev) => ({
        ...prev,
        responses: prev.responses.map((r) =>
          r.id === existing.id ? { ...r, responseStatus: 'interested' as const, createdAt: new Date().toISOString() } : r
        ),
        updates: [notif, ...prev.updates],
      }));
      return;
    }

    const now = new Date().toISOString();
    const newResp: import('@/lib/mock').Response = {
      id: `rr-ask-${Date.now()}`,
      requestId,
      userId: escortId,
      responseStatus: 'interested',
      createdAt: now,
    };
    const notif: UpdateEvent = {
      id: `ue-ask-${Date.now()}`,
      userId: request.creatorId,
      actorId: escortId,
      eventType: 'response_received',
      refRequestId: requestId,
      createdAt: now,
      read: false,
    };
    setState((prev) => ({
      ...prev,
      responses: [...prev.responses, newResp],
      updates: [notif, ...prev.updates],
    }));
  }, []);

  // Creator accepts an 'interested' joiner: flips to 'joining', creates invitation + chat.
  // For requests with peopleCount > 1, uses a shared group thread (g-{requestId}).
  const acceptResponder = useCallback((responseId: string) => {
    setState((prev) => {
      const target = prev.responses.find((r) => r.id === responseId);
      if (!target || target.responseStatus !== 'interested') return prev;

      const req = prev.requests.find((r) => r.id === target.requestId);
      if (!req) return prev;

      // Hard cap guard — never accept past peopleCount
      const currentJoiners = prev.responses.filter(
        (r) => r.requestId === target.requestId && r.responseStatus === 'joining'
      ).length;
      if (currentJoiners >= req.peopleCount) return prev;

      const now = new Date().toISOString();
      const chatExpiresAt = new Date(Date.now() + 8 * 3_600_000).toISOString();
      const isGroup = req.peopleCount > 1;
      const groupThreadId = isGroup ? `g-${target.requestId}` : null;

      const newInvite: Invitation = {
        id: `i-accept-${Date.now()}`,
        requestId: target.requestId,
        fromUserId: target.userId,     // escort
        toUserId: prev.currentUserId,  // creator
        status: 'accepted',
        createdAt: now,
        respondedAt: now,
        chatExpiresAt,
        groupThreadId: isGroup ? groupThreadId! : undefined,
      };

      const escortNotif: UpdateEvent = {
        id: `ue-accept-${Date.now()}`,
        userId: target.userId,
        actorId: prev.currentUserId,
        eventType: 'invite_accepted',
        refRequestId: target.requestId,
        createdAt: now,
        read: false,
      };

      const updatedResponses = prev.responses.map((r) =>
        r.id === responseId ? { ...r, responseStatus: 'joining' as const } : r
      );

      // Auto-close request if now at cap
      const joinersCount = updatedResponses.filter(
        (r) => r.requestId === target.requestId && r.responseStatus === 'joining'
      ).length;
      const autoClose = joinersCount >= req.peopleCount;

      return {
        ...prev,
        responses: updatedResponses,
        requests: autoClose
          ? prev.requests.map((r) => r.id === target.requestId ? { ...r, status: 'closed' as const } : r)
          : prev.requests,
        invitations: [...prev.invitations, newInvite],
        updates: [escortNotif, ...prev.updates],
        inboxUnread: true,
      };
    });
  }, []);

  // Record that an escort viewed this request detail (FOMO tracking).
  const recordRequestViewer = useCallback((requestId: string) => {
    const s = getState();
    const request = s.requests.find((r) => r.id === requestId);
    if (!request) return;
    if (request.creatorId === s.currentUserId) return;
    const viewerId = s.currentUserId;
    if (request.requestViewers?.includes(viewerId)) return;
    // Only record for escorts
    const viewer = s.users.find((u) => u.id === viewerId);
    if (viewer?.role !== 'escort') return;

    setState((prev) => ({
      ...prev,
      requests: prev.requests.map((r) =>
        r.id === requestId
          ? { ...r, requestViewers: [...(r.requestViewers ?? []), viewerId] }
          : r
      ),
    }));
  }, []);

  // Decline a joiner. Penalty (−1 slot) ONLY when rejecting an already-accepted ('joining') response.
  const declineResponder = useCallback((responseId: string) => {
    setState((prev) => {
      const target = prev.responses.find((r) => r.id === responseId);
      if (!target) return prev;
      const wasAccepted = target.responseStatus === 'joining';

      const responses = prev.responses.map((r) =>
        r.id === responseId ? { ...r, responseStatus: 'declined' as const } : r
      );

      // Reopen request if it was auto-closed by this joiner's slot
      const req = prev.requests.find((r) => r.id === target.requestId);
      const remainingJoiners = responses.filter(
        (r) => r.requestId === target.requestId && r.responseStatus === 'joining'
      ).length;
      const requests = (req && req.status === 'closed' && remainingJoiners < req.peopleCount)
        ? prev.requests.map((r) => r.id === req.id ? { ...r, status: 'open' as const } : r)
        : prev.requests;

      // Decline the matching invitation too (if one existed from accept)
      const invitations = wasAccepted
        ? prev.invitations.map((i) =>
            i.requestId === target.requestId && i.fromUserId === target.userId && i.status === 'accepted'
              ? { ...i, status: 'declined' as const, respondedAt: new Date().toISOString() }
              : i
          )
        : prev.invitations;

      // Penalty only when rejecting an already-accepted joiner
      const users = wasAccepted
        ? prev.users.map((u) =>
            u.id === prev.currentUserId
              ? { ...u, monthlyRequestsLeft: Math.max(0, u.monthlyRequestsLeft - 1) }
              : u
          )
        : prev.users;

      return { ...prev, responses, requests, invitations, users };
    });
  }, []);

  // Spend 35 credits to buy 1 extra monthly request slot.
  const buyExtraSlot = useCallback(() => {
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === prev.currentUserId
          ? {
              ...u,
              credits: Math.max(0, u.credits - EXTRA_SLOT_CREDIT_COST),
              monthlyRequestsLeft: u.monthlyRequestsLeft + 1,
            }
          : u
      ),
    }));
  }, []);

  const toggleFollow = useCallback((targetId: string) => {
    setState((prev) => {
      const existing = prev.follows.find(
        (f) => f.followerId === prev.currentUserId && f.followingId === targetId
      );
      if (existing) {
        return { ...prev, follows: prev.follows.filter((f) => f.id !== existing.id) };
      }
      const newFollow: Follow = {
        id: `f-${Date.now()}`,
        followerId: prev.currentUserId,
        followingId: targetId,
        createdAt: new Date().toISOString(),
      };
      return { ...prev, follows: [...prev.follows, newFollow] };
    });
  }, []);

  const blockUser = useCallback((targetId: string) => {
    setState((prev) => ({
      ...prev,
      userBlocks: [...new Set([...prev.userBlocks, targetId])],
    }));
  }, []);

  const unblockUser = useCallback((targetId: string) => {
    setState((prev) => ({
      ...prev,
      userBlocks: prev.userBlocks.filter((id) => id !== targetId),
    }));
  }, []);

  const markUpdatesRead = useCallback((ids: string[]) => {
    setState((prev) => ({
      ...prev,
      readUpdateIds: [...new Set([...prev.readUpdateIds, ...ids])],
    }));
  }, []);

  const reset = useCallback(() => {
    globalState = getSeedState();
    saveState(globalState);
    localStorage.removeItem('sl_onboarded');
    localStorage.removeItem('sl_state_v2');
    listeners.forEach((l) => l());
  }, []);

  const sendChatMessage = useCallback((threadId: string, text: string, overrideSenderId?: string) => {
    const newMsg: ChatMessage = {
      id: `cm-${Date.now()}`,
      threadId,
      senderId: overrideSenderId ?? getState().currentUserId,
      text,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      chatMessages: [...prev.chatMessages, newMsg],
    }));
    return newMsg;
  }, []);

  const sendDirectMessage = useCallback(
    (toUserId: string, msg: Omit<DirectMessage, 'id' | 'createdAt' | 'read'>) => {
      const newDm: DirectMessage = {
        ...msg,
        id: `dm-${Date.now()}`,
        createdAt: new Date().toISOString(),
        read: false,
      };
      setState((prev) => ({
        ...prev,
        directMessages: [...prev.directMessages, newDm],
      }));
      return newDm;
    },
    []
  );

  // Confirm meetup: locks the chat and records the meet
  const confirmMeetup = useCallback((inviteId: string, otherUserId: string) => {
    setState((prev) => ({
      ...prev,
      invitations: prev.invitations.map((inv) =>
        inv.id === inviteId ? { ...inv, meetupConfirmed: true } : inv
      ),
      meetRecords: [
        ...prev.meetRecords.filter((r) => r.userId !== otherUserId),
        {
          userId: otherUserId,
          metAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        },
      ],
    }));
  }, []);

  // Group attendance: escort marks themselves as attended on a group request.
  // Case closes when all joiners have confirmed.
  const confirmGroupAttendance = useCallback((requestId: string) => {
    setState((prev) => {
      const escortId = prev.currentUserId;
      // Mark the escort's invitation as meetupConfirmed
      const updatedInvitations = prev.invitations.map((inv) =>
        inv.requestId === requestId && inv.fromUserId === escortId && inv.status === 'accepted'
          ? { ...inv, meetupConfirmed: true }
          : inv
      );
      // Record the meet with the creator
      const req = prev.requests.find((r) => r.id === requestId);
      const creatorId = req?.creatorId ?? '';
      const newMeetRecord = creatorId
        ? {
            userId: creatorId,
            metAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          }
        : null;
      // Check if all joiners have confirmed → auto-close the request
      const allJoinerInvites = updatedInvitations.filter(
        (inv) => inv.requestId === requestId && inv.status === 'accepted'
      );
      const allConfirmed = allJoinerInvites.length > 0 && allJoinerInvites.every((inv) => inv.meetupConfirmed);
      return {
        ...prev,
        invitations: updatedInvitations,
        requests: allConfirmed
          ? prev.requests.map((r) => r.id === requestId ? { ...r, status: 'closed' as const } : r)
          : prev.requests,
        meetRecords: newMeetRecord
          ? [...prev.meetRecords.filter((r) => r.userId !== creatorId), newMeetRecord]
          : prev.meetRecords,
      };
    });
  }, []);

  const clearInboxUnread = useCallback(() => {
    setState((prev) => ({ ...prev, inboxUnread: false }));
  }, []);

  const likePost = useCallback((postId: string) => {
    setState((prev) => {
      const alreadyLiked = prev.likedPostIds.includes(postId);
      return {
        ...prev,
        likedPostIds: alreadyLiked
          ? prev.likedPostIds.filter((id) => id !== postId)
          : [...prev.likedPostIds, postId],
        momentPosts: prev.momentPosts.map((p) =>
          p.id === postId
            ? { ...p, likeCount: p.likeCount + (alreadyLiked ? -1 : 1) }
            : p
        ),
      };
    });
  }, []);

  return {
    state,
    currentUser,
    isOnline,
    currentOnlineStatus,
    unreadCount,
    switchUser,
    setOnline,
    setStatus,
    setArea,
    updateUser,
    postRequest,
    respondToRequest,
    sendInvite,
    respondToInvite,
    closeRequest,
    declineResponder,
    buyExtraSlot,
    joinRequest,
    acceptResponder,
    cancelJoinRequest,
    recordRequestViewer,
    toggleFollow,
    blockUser,
    unblockUser,
    markUpdatesRead,
    reset,
    sendChatMessage,
    sendDirectMessage,
    confirmMeetup,
    confirmGroupAttendance,
    clearInboxUnread,
    likePost,
  };
}
