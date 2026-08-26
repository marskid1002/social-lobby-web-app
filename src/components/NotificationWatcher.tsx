'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAppState } from '@/lib/state';
import { unseenUpdatesForUser, updateIdsForUser } from '@/lib/notification-dedupe';

/**
 * 監聽 updates 與 inboxUnread，有新訊息時彈出 toast。
 * 同時監控主身份與第二身份的通知。
 */
export function NotificationWatcher() {
  const { state, sharedSyncReady } = useAppState();

  // 以通知 id 去重；每個新加入監聽的身份先建立基準，舊通知不重播。
  const seenUpdateIdsRef = useRef(new Set<string>());
  const initializedUserIdsRef = useRef(new Set<string>());
  const prevInboxUnreadRef = useRef(false);
  const inboxInitializedRef = useRef(false);

  const watchedUserIds = [
    state.currentUserId,
    ...(state.secondaryUserId ? [state.secondaryUserId] : []),
  ];

  useEffect(() => {
    // 必須等第一次 server 同步完成；否則同步回來的舊通知會被誤認為剛發生。
    if (!sharedSyncReady) return;

    if (!inboxInitializedRef.current) {
      prevInboxUnreadRef.current = state.inboxUnread;
      inboxInitializedRef.current = true;
    }

    // 檢查每個身份是否有新通知
    for (const uid of watchedUserIds) {
      const currentIds = updateIdsForUser(state.updates, uid);
      if (!initializedUserIdsRef.current.has(uid)) {
        currentIds.forEach((id) => seenUpdateIdsRef.current.add(id));
        initializedUserIdsRef.current.add(uid);
        continue;
      }

      const newUpdates = unseenUpdatesForUser(state.updates, uid, seenUpdateIdsRef.current);
      if (newUpdates.length > 0) {
        const user = state.users.find((u) => u.id === uid);
        const isPrimary = uid === state.currentUserId;

        for (const upd of newUpdates) {
          const actor = state.users.find((u) => u.id === upd.actorId);
          const actorName = actor?.nickname ?? '某人';

          let message = '';
          if (upd.eventType === 'invite_received') message = upd.refRequestId ? `${actorName} 邀你一起約會` : `${actorName} 傳送了私人邀請給你`;
          else if (upd.eventType === 'invite_accepted') message = `${actorName} 接受了你的邀請`;
          else if (upd.eventType === 'response_received') message = `${actorName} 想參加你的約會`;
          else if (upd.eventType === 'request_posted') message = `${actorName} 發起了新的約會`;
          else if (upd.eventType === 'milestone_views') message = `你的約會被很多人看到囉`;
          else if (upd.eventType === 'plaza_reply') message = `${actorName} 回覆了你的廣場貼文`;
          else message = '你有一則新通知';

          toast(message, {
            description: isPrimary ? undefined : `（${user?.nickname} 的通知）`,
            duration: 4000,
            icon: isPrimary ? '🔔' : '👤',
          });
        }
      }
      currentIds.forEach((id) => seenUpdateIdsRef.current.add(id));
    }

    // 監聽 inboxUnread 變為 true（配對成功）
    if (inboxInitializedRef.current && state.inboxUnread && !prevInboxUnreadRef.current) {
      const user = state.users.find((u) => u.id === state.currentUserId);
      toast('收件匣有新配對！', {
        description: user ? '你的邀請已確認，聊天室開好了' : undefined,
        duration: 5000,
        icon: '✅',
      });
    }
    prevInboxUnreadRef.current = state.inboxUnread;
  }, [sharedSyncReady, state]);

  return null;
}
