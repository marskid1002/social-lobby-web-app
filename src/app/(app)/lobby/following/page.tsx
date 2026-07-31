'use client';

import { useAppState, escortPeerIds } from '@/lib/state';
import { LobbyGrid } from '@/components/LobbyGrid';
import { activeConfirmedGirlIds } from '@/lib/request-attendance';

export default function FollowingPage() {
  const { state, currentUser } = useAppState();

  const escortIds = escortPeerIds(state); // 只顯示幹部自建的真實小姐
  const busyGirlIds = activeConfirmedGirlIds(state.responses, state.invitations);
  const followingIds = state.follows
    .filter((f) => f.followerId === currentUser?.id)
    .map((f) => f.followingId);

  const followingOnline = state.users.filter(
    (u) => followingIds.includes(u.id) && escortIds.has(u.id) && state.onlineUserIds.includes(u.id)
  );

  function getStatus(userId: string) {
    const status = state.onlineStatuses.find((s) => s.userId === userId);
    return status && busyGirlIds.has(userId) ? { ...status, status: 'busy' as const } : status;
  }

  return (
    <LobbyGrid
      users={followingOnline}
      getStatus={getStatus}
      emptyTitle="你還沒關注任何人"
      emptyBody="到探索找你感興趣的人"
      emptyCta="到探索找人"
      emptyCtaHref="/lobby/explore"
    />
  );
}
