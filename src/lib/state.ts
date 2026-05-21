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
} from '@/lib/mock';
import type { User, OnlineStatus, Request, Response, Invitation, UpdateEvent, Follow, ChatMessage, DirectMessage } from '@/lib/mock';

const STORAGE_KEY = 'sl_state_v1';

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
  };
}

function loadState(): AppState {
  if (typeof window === 'undefined') return getSeedState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getSeedState();
    const parsed = JSON.parse(raw);
    // Merge with seed to pick up any new fields
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

  const postRequest = useCallback((req: Omit<Request, 'id' | 'creatorId' | 'createdAt' | 'expiresAt' | 'status'>) => {
    const newReq: Request = {
      ...req,
      id: `r-${Date.now()}`,
      creatorId: getState().currentUserId,
      status: 'open',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 4 * 3_600_000).toISOString(),
    };
    setState((prev) => ({
      ...prev,
      requests: [newReq, ...prev.requests],
      users: prev.users.map((u) =>
        u.id === prev.currentUserId ? { ...u, credits: Math.max(0, u.credits - 1) } : u
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

  const sendInvite = useCallback((toUserId: string, requestId: string | null, message?: string) => {
    const newInvite: Invitation = {
      id: `i-${Date.now()}`,
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
    }));
  }, []);

  const respondToInvite = useCallback((inviteId: string, accept: boolean) => {
    setState((prev) => ({
      ...prev,
      invitations: prev.invitations.map((i) =>
        i.id === inviteId ? { ...i, status: accept ? 'accepted' : 'declined', respondedAt: new Date().toISOString() } : i
      ),
    }));
  }, []);

  const closeRequest = useCallback((requestId: string) => {
    setState((prev) => ({
      ...prev,
      requests: prev.requests.map((r) =>
        r.id === requestId ? { ...r, status: 'closed' } : r
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
    listeners.forEach((l) => l());
  }, []);

  const sendChatMessage = useCallback((threadId: string, text: string) => {
    const newMsg: ChatMessage = {
      id: `cm-${Date.now()}`,
      threadId,
      senderId: getState().currentUserId,
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
    toggleFollow,
    blockUser,
    unblockUser,
    markUpdatesRead,
    reset,
    sendChatMessage,
    sendDirectMessage,
  };
}
