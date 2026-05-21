'use client';

import { useSearchParams } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { LobbyGrid } from '@/components/LobbyGrid';
import { Suspense } from 'react';

function ExploreContent() {
  const { state, currentUser } = useAppState();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';

  const onlineUsers = state.users.filter(
    (u) => state.onlineUserIds.includes(u.id) && u.id !== currentUser?.id
  );

  function getStatus(userId: string) {
    return state.onlineStatuses.find((s) => s.userId === userId);
  }

  function hasMet(userId: string) {
    return state.meetRecords.some((r) => r.userId === userId);
  }

  return (
    <LobbyGrid
      users={onlineUsers}
      getStatus={getStatus}
      hasMet={hasMet}
      emptyTitle="目前沒有人在線"
      emptyBody="成為第一個上線的人吧"
      searchQuery={q}
    />
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-zinc-400">載入中...</div>}>
      <ExploreContent />
    </Suspense>
  );
}
