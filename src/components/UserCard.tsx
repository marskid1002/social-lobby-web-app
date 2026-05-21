'use client';

import { useRouter } from 'next/navigation';
import type { User, OnlineStatus } from '@/lib/mock';

const CARD_GRADIENTS = ['bg-gradient-card-a', 'bg-gradient-card-b', 'bg-gradient-card-c'];

const STATUS_LABELS: Record<string, string> = {
  available: '可接局',
  fill_spot: '可補位',
  bring_people: '可帶人',
  busy: '忙碌',
};

const STATUS_COLORS: Record<string, string> = {
  available: '#10B981',
  fill_spot: '#F59E0B',
  bring_people: '#3B82F6',
  busy: '#6B7280',
};

interface Props {
  user: User;
  status?: OnlineStatus;
  index: number;
}

export function UserCard({ user, status, index }: Props) {
  const router = useRouter();
  const gradient = CARD_GRADIENTS[index % 3];

  return (
    <button
      onClick={() => router.push(`/u/${user.id}`)}
      className={`relative aspect-[3/4] rounded-[28px] overflow-hidden shadow-card active:scale-[0.97] transition-transform w-full text-left ${gradient}`}
      aria-label={`查看 ${user.nickname} 的個人檔案`}
    >
      {/* Avatar */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2">
        <img
          src={user.avatarUrl}
          alt={user.nickname}
          className="w-20 h-20 rounded-full object-cover ring-4 ring-white/80 shadow-card"
        />
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/20 to-transparent">
        <p className="text-base font-semibold text-brand-ink leading-tight">{user.nickname}</p>
        {status && (
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: STATUS_COLORS[status.status] }}
            />
            <span className="text-xs font-medium text-brand-ink/70">
              {STATUS_LABELS[status.status]} · {status.area}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}
