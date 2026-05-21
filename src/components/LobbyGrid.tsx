'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useAppState } from '@/lib/state';
import { TAIPEI_AREAS } from '@/lib/mock';
import type { User, OnlineStatus } from '@/lib/mock';
import { UserCard } from '@/components/UserCard';
import Link from 'next/link';

interface Props {
  users: User[];
  getStatus: (userId: string) => OnlineStatus | undefined;
  emptyTitle?: string;
  emptyBody?: string;
  emptyCta?: string;
  emptyCtaHref?: string;
  searchQuery?: string;
}

export function LobbyGrid({
  users,
  getStatus,
  emptyTitle = '這裡還沒有人',
  emptyBody = '',
  emptyCta,
  emptyCtaHref,
  searchQuery = '',
}: Props) {
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  const filtered = users.filter((u) => {
    const matchArea = !selectedArea || getStatus(u.id)?.area === selectedArea || u.defaultArea === selectedArea;
    const matchSearch = !searchQuery || u.nickname.includes(searchQuery);
    return matchArea && matchSearch;
  });

  return (
    <div className="px-3 py-3">
      {/* Area filter chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
        <button className="shrink-0 w-8 h-8 rounded-full bg-white border border-brand-lavender flex items-center justify-center shadow-sm" aria-label="篩選">
          <SlidersHorizontal className="w-4 h-4 text-zinc-500" strokeWidth={1.75} />
        </button>
        <button
          onClick={() => setSelectedArea(null)}
          className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            !selectedArea ? 'bg-brand-ink text-white' : 'bg-white text-zinc-600 border border-brand-lavender'
          }`}
        >
          全部
        </button>
        {TAIPEI_AREAS.map((area) => (
          <button
            key={area}
            onClick={() => setSelectedArea(selectedArea === area ? null : area)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              selectedArea === area ? 'bg-brand-ink text-white' : 'bg-white text-zinc-600 border border-brand-lavender'
            }`}
          >
            {area}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="w-20 h-20 rounded-3xl bg-gradient-card-a flex items-center justify-center mb-4 shadow-card">
            <span className="text-4xl">✨</span>
          </div>
          <p className="text-base font-semibold text-brand-ink mb-1">{emptyTitle}</p>
          {emptyBody && <p className="text-sm text-zinc-400 mb-4">{emptyBody}</p>}
          {emptyCta && emptyCtaHref && (
            <Link
              href={emptyCtaHref}
              className="px-6 py-2.5 rounded-2xl bg-brand-pink text-brand-ink font-semibold text-sm active:scale-95 transition-transform"
            >
              {emptyCta}
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((user, i) => (
            <UserCard key={user.id} user={user} status={getStatus(user.id)} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
