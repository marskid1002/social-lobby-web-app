'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

export default function UpdatesPage() {
  const { state, markUpdatesRead } = useAppState();
  const router = useRouter();

  const myFollows = state.follows.filter((f) => f.followerId === state.currentUserId);
  const followedIds = new Set(myFollows.map((f) => f.followingId));

  useEffect(() => {
    const unreadIds = state.updates
      .filter((u) => u.userId === state.currentUserId && !state.readUpdateIds.includes(u.id))
      .map((u) => u.id);
    if (unreadIds.length > 0) markUpdatesRead(unreadIds);
  }, []);

  if (followedIds.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-card-c flex items-center justify-center mb-4 shadow-card">
          <span className="text-4xl">🔔</span>
        </div>
        <p className="text-base font-semibold text-brand-ink mb-1">目前沒有動態</p>
        <p className="text-sm text-zinc-400">追蹤你感興趣的用戶，就能在這裡看到他們的最新動態</p>
      </div>
    );
  }

  const now = Date.now();

  // Notifications from followed users: recent posts + online statuses
  type Notification = {
    id: string;
    userId: string;
    text: string;
    createdAt: string;
  };

  const notifications: Notification[] = [];

  // Recent posts by followed users (within 24h)
  for (const post of state.momentPosts) {
    if (!followedIds.has(post.authorId)) continue;
    if (now - new Date(post.createdAt).getTime() > TWENTY_FOUR_HOURS) continue;
    const author = state.users.find((u) => u.id === post.authorId);
    if (!author) continue;
    notifications.push({
      id: `post-${post.id}`,
      userId: post.authorId,
      text: `${author.nickname} 發了新貼文`,
      createdAt: post.createdAt,
    });
  }

  // Recent online statuses for followed users
  for (const status of state.onlineStatuses) {
    if (!followedIds.has(status.userId)) continue;
    if (now - new Date(status.lastSeen).getTime() > TWENTY_FOUR_HOURS) continue;
    const user = state.users.find((u) => u.id === status.userId);
    if (!user) continue;
    notifications.push({
      id: `online-${status.userId}`,
      userId: status.userId,
      text: `${user.nickname} 剛上線`,
      createdAt: status.lastSeen,
    });
  }

  notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-card-c flex items-center justify-center mb-4 shadow-card">
          <span className="text-4xl">🔔</span>
        </div>
        <p className="text-base font-semibold text-brand-ink mb-1">目前沒有新動態</p>
        <p className="text-sm text-zinc-400">你追蹤的用戶目前沒有新動態</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 flex flex-col gap-2">
      {notifications.map((n) => {
        const user = state.users.find((u) => u.id === n.userId);
        return (
          <button
            key={n.id}
            onClick={() => router.push(`/u/${n.userId}`)}
            className="w-full flex items-center gap-3 p-3 rounded-2xl text-left bg-white border border-brand-lavender shadow-card active:bg-brand-snow transition-colors"
          >
            {user && (
              <img
                src={user.avatarUrl}
                alt={user.nickname}
                className="w-10 h-10 rounded-full object-cover shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-brand-ink">{n.text}</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {formatDistanceToNow(new Date(n.createdAt), { locale: zhTW, addSuffix: true })}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
