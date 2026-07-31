'use client';

import { useAppState, escortPeerIds } from '@/lib/state';
import { LobbyGrid } from '@/components/LobbyGrid';
import { activeConfirmedGirlIds } from '@/lib/request-attendance';

export default function NearbyPage() {
  const { state, currentUser } = useAppState();

  const myArea = currentUser?.defaultArea;
  const escortIds = escortPeerIds(state); // 只顯示幹部自建的真實小姐
  const busyGirlIds = activeConfirmedGirlIds(state.responses, state.invitations);

  const nearbyUsers = state.users.filter((u) => {
    if (u.id === currentUser?.id) return false;
    if (!escortIds.has(u.id)) return false;
    if (!state.onlineUserIds.includes(u.id)) return false;
    const status = state.onlineStatuses.find((s) => s.userId === u.id);
    return status?.area === myArea;
  });

  function getStatus(userId: string) {
    const status = state.onlineStatuses.find((s) => s.userId === userId);
    return status && busyGirlIds.has(userId) ? { ...status, status: 'busy' as const } : status;
  }

  return (
    <LobbyGrid
      users={nearbyUsers}
      getStatus={getStatus}
      emptyTitle="附近還沒有人在線"
      emptyBody={`${myArea ?? '你的區域'}目前沒有人上線`}
    />
  );
}
