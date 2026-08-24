'use client';

import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import type { User, OnlineStatus } from '@/lib/mock';
import { UserCard } from '@/components/UserCard';
import Link from 'next/link';
import { ALL_AREA_DISTRICTS, AREA_CITIES, AREA_OPTIONS } from '@/lib/area-options';

const ALL_INTERESTS = [
  '夜生活', '酒吧', '電影', '美食', '音樂', '調酒', '攝影', '健身', '電音',
  '爵士', '紅酒', '咖啡廳', '展覽', '藝術', 'DJ', '夜店', 'KTV', '麻將',
  '爬山', '露營', '時尚', '威士忌', '旅行', '韓劇', 'After Party', '雞尾酒',
];

interface Props {
  users: User[];
  getStatus: (userId: string) => OnlineStatus | undefined;
  hasMet?: (userId: string) => boolean;
  emptyTitle?: string;
  emptyBody?: string;
  emptyCta?: string;
  emptyCtaHref?: string;
  searchQuery?: string;
}

export function LobbyGrid({
  users,
  getStatus,
  hasMet,
  emptyTitle = '這裡還沒有人',
  emptyBody = '',
  emptyCta,
  emptyCtaHref,
  searchQuery = '',
}: Props) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function clearFilters() {
    setSelectedArea(null);
    setSelectedTags([]);
  }

  const activeFilterCount = (selectedArea ? 1 : 0) + selectedTags.length;

  const filtered = users.filter((u) => {
    const matchArea = !selectedArea || getStatus(u.id)?.area === selectedArea || u.defaultArea === selectedArea;
    const matchSearch = !searchQuery || u.nickname.includes(searchQuery);
    const matchTags = selectedTags.length === 0 || selectedTags.some((t) => u.interests.includes(t));
    return matchArea && matchSearch && matchTags;
  });

  return (
    <div className="px-3 py-3">
      {/* Filter row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
        <button
          onClick={() => setFilterOpen(true)}
          className={`relative shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm transition-colors ${
            activeFilterCount > 0 ? 'bg-brand-ink' : 'bg-white border border-brand-lavender'
          }`}
          aria-label="篩選"
        >
          <SlidersHorizontal
            className={`w-4 h-4 ${activeFilterCount > 0 ? 'text-white' : 'text-zinc-500'}`}
            strokeWidth={1.75}
          />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand-pink text-brand-ink text-[10px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setSelectedArea(null)}
          className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            !selectedArea ? 'bg-brand-ink text-white' : 'bg-white text-zinc-600 border border-brand-lavender'
          }`}
        >
          全部
        </button>
        {ALL_AREA_DISTRICTS.map((area) => (
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
            <UserCard key={user.id} user={user} status={getStatus(user.id)} index={i} hasMet={hasMet?.(user.id)} />
          ))}
        </div>
      )}

      {/* Filter sheet */}
      {filterOpen && (
        <div className="app-modal-layer fixed inset-0 flex items-end justify-center" onClick={() => setFilterOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="app-bottom-sheet relative w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle + header */}
            <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-brand-ink">篩選</h3>
              <div className="flex items-center gap-3">
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="text-xs text-zinc-400 underline">
                    清除
                  </button>
                )}
                <button
                  onClick={() => setFilterOpen(false)}
                  className="w-8 h-8 rounded-full bg-brand-snow flex items-center justify-center"
                  aria-label="關閉"
                >
                  <X className="w-4 h-4 text-zinc-500" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            {/* Area section */}
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">地區</p>
            <div className="mb-6 flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedArea(null)}
                className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors ${
                  !selectedArea ? 'bg-brand-ink text-white' : 'bg-brand-snow text-zinc-600 border border-brand-lavender'
                }`}
              >
                全部
              </button>
            </div>
            <div className="mb-6 space-y-4">
              {AREA_CITIES.map((city) => (
                <div key={city}>
                  <p className="mb-2 text-xs font-bold text-brand-ink">{city}</p>
                  <div className="flex flex-wrap gap-2">
                    {AREA_OPTIONS[city].map((area) => (
                      <button
                        key={area}
                        onClick={() => setSelectedArea(selectedArea === area ? null : area)}
                        className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                          selectedArea === area ? 'bg-brand-ink text-white' : 'bg-brand-snow text-zinc-600 border border-brand-lavender'
                        }`}
                      >
                        {area}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Interests/Tags section */}
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">興趣 / 標籤</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {ALL_INTERESTS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-brand-sky text-brand-ink border border-brand-sky'
                      : 'bg-brand-snow text-zinc-600 border border-brand-lavender'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>

            <button
              onClick={() => setFilterOpen(false)}
              className="w-full py-3.5 rounded-2xl bg-brand-ink text-white font-semibold text-sm active:scale-[0.98] transition-all"
            >
              套用篩選{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
