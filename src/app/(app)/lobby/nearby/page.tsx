'use client';

import { useAppState } from '@/lib/state';
import { LobbyGrid } from '@/components/LobbyGrid';

export default function NearbyPage() {
  const { state, currentUser } = useAppState();

  const myArea = currentUser?.defaultArea;

  const nearbyUsers = state.users.filter((u) => {
    if (u.id === currentUser?.id) return false;
    if (!state.onlineUserIds.includes(u.id)) return false;
    const status = state.onlineStatuses.find((s) => s.userId === u.id);
    return status?.area === myArea;
  });

  function getStatus(userId: string) {
    return state.onlineStatuses.find((s) => s.userId === userId);
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
