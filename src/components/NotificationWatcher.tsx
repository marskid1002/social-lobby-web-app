'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAppState } from '@/lib/state';

/**
 * 監聽 updates 與 inboxUnread，有新訊息時彈出 toast。
 * 同時監控主身份與第二身份的通知。
 */
export function NotificationWatcher() {
  const { state } = useAppState();

  // 用 ref 追蹤上一次看到的 update 數量（避免首次載入觸發）
  const prevUpdateCountRef = useRef<Record<string, number>>({});
  const prevInboxUnreadRef = useRef(false);
  const initializedRef = useRef(false);

  const watchedUserIds = [
    state.currentUserId,
    ...(state.secondaryUserId ? [state.secondaryUserId] : []),
  ];

  useEffect(() => {
    // 首次執行：記錄基準數量，不彈通知
    if (!initializedRef.current) {
      const counts: Record<string, number> = {};
      for (const uid of watchedUserIds) {
        counts[uid] = state.updates.filter((u) => u.userId === uid).length;
      }
      prevUpdateCountRef.current = counts;
      prevInboxUnreadRef.current = state.inboxUnread;
      initializedRef.current = true;
      return;
    }

    // 檢查每個身份是否有新通知
    for (const uid of watchedUserIds) {
      const currentCount = state.updates.filter((u) => u.userId === uid).length;
      const prevCount = prevUpdateCountRef.current[uid] ?? 0;

      if (currentCount > prevCount) {
        const user = state.users.find((u) => u.id === uid);
        const isPrimary = uid === state.currentUserId;
        const newUpdates = state.updates
          .filter((u) => u.userId === uid)
          .slice(0, currentCount - prevCount);

        for (const upd of newUpdates) {
          const actor = state.users.find((u) => u.id === upd.actorId);
          const actorName = actor?.nickname ?? '某人';

          let message = '';
          if (upd.eventType === 'invite_received') message = `${actorName} 傳送了邀請`;
          else if (upd.eventType === 'invite_accepted') message = `${actorName} 接受了你的邀請`;
          else if (upd.eventType === 'response_received') message = `${actorName} 想加入你的局`;
          else if (upd.eventType === 'request_posted') message = `${actorName} 發布了新的局`;
          else if (upd.eventType === 'milestone_views') message = `你的需求達到里程碑`;
          else if (upd.eventType === 'plaza_reply') message = `${actorName} 回覆了你的廣場貼文`;
          else message = '你有一則新通知';

          toast(message, {
            description: isPrimary ? undefined : `（${user?.nickname} 的通知）`,
            duration: 4000,
            icon: isPrimary ? '🔔' : '👤',
          });
        }

        prevUpdateCountRef.current = { ...prevUpdateCountRef.current, [uid]: currentCount };
      }
    }

    // 監聽 inboxUnread 變為 true（配對成功）
    if (state.inboxUnread && !prevInboxUnreadRef.current) {
      const user = state.users.find((u) => u.id === state.currentUserId);
      toast('收件匣有新配對！', {
        description: user ? `${user.nickname} 的邀請已確認` : undefined,
        duration: 5000,
        icon: '✅',
      });
    }
    prevInboxUnreadRef.current = state.inboxUnread;
  });

  return null;
}
