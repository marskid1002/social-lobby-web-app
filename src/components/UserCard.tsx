'use client';

import { useRouter } from 'next/navigation';
import type { User, OnlineStatus } from '@/lib/mock';

const CARD_GRADIENTS = ['bg-gradient-card-a', 'bg-gradient-card-b', 'bg-gradient-card-c'];

interface Props {
  user: User;
  status?: OnlineStatus;
  index: number;
  hasMet?: boolean;
}

export function UserCard({ user, status, index, hasMet }: Props) {
  const router = useRouter();
  const gradient = CARD_GRADIENTS[index % 3];

  return (
    <button
      onClick={() => router.push(`/u/${user.id}`)}
      className={`relative aspect-3/4 rounded-[28px] overflow-hidden shadow-card active:scale-[0.97] transition-transform w-full text-left ${!user.cardImageUrl ? gradient : ''}`}
      aria-label={`查看 ${user.nickname} 的個人檔案`}
    >
      {/* Blurred photo background */}
      {user.cardImageUrl && (
        <>
          <img src={user.cardImageUrl} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 backdrop-blur-sm bg-black/10" />
        </>
      )}

      {/* Met badge — top right */}
      {hasMet && (
        <div className="absolute top-3 right-3 z-20 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow-sm text-base">
          ⭐
        </div>
      )}

      {/* Avatar */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10">
        <img
          src={user.avatarUrl}
          alt={user.nickname}
          className="w-20 h-20 rounded-full object-cover ring-4 ring-white/80 shadow-card"
        />
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-linear-to-t from-black/50 to-transparent z-10">
        <div className="flex items-center gap-1.5">
          <p className="text-base font-semibold text-white leading-tight drop-shadow">{user.nickname}</p>
          {hasMet && <span className="text-sm leading-none">⭐</span>}
        </div>
        {status && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-block w-2 h-2 rounded-full shrink-0 bg-green-400" />
            <span className="text-xs font-medium text-white/80">
              上線 · {status.area}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}
