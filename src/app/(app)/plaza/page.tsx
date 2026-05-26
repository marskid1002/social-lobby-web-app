'use client';

import { useState } from 'react';
import { useAppState } from '@/lib/state';
import { MomentCard } from '@/components/MomentCard';
import { Lock, PenLine } from 'lucide-react';

export default function PlazaPage() {
  const { state, currentUser } = useAppState();
  const tier = currentUser?.tier ?? 'free';
  const [draftText, setDraftText] = useState('');
  const [posted, setPosted] = useState(false);

  // Free users see a full lock screen
  if (tier === 'free') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-8 text-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-card-a flex items-center justify-center mb-4 shadow-card">
          <Lock className="w-8 h-8 text-zinc-400" strokeWidth={1.75} />
        </div>
        <p className="text-base font-semibold text-brand-ink mb-2">探索更多，認識更多</p>
        <p className="text-sm text-zinc-400 mb-6">升級會員，進入社群廣場，認識更多今晚在線的用戶</p>
        <button
          disabled
          className="px-6 py-3 rounded-2xl bg-brand-pink text-brand-ink font-semibold text-sm opacity-70 cursor-not-allowed"
        >
          了解會員方案
        </button>
      </div>
    );
  }

  const isVip = tier === 'vip';
  const canPost = tier === 'premium' || tier === 'vip';

  // Sort posts newest first
  const posts = [...state.momentPosts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  function handlePost() {
    if (!draftText.trim()) return;
    // Demo: just show a toast-style confirmation, no real state mutation needed
    setPosted(true);
    setDraftText('');
    setTimeout(() => setPosted(false), 3000);
  }

  return (
    <div className="px-4 pt-4 pb-24">
      {/* Post composer (premium + vip only) */}
      {canPost && (
        <div className="bg-white rounded-2xl border border-brand-lavender p-4 mb-4 shadow-card">
          <div className="flex items-start gap-3">
            {currentUser && (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.nickname}
                className="w-9 h-9 rounded-full object-cover shrink-0 mt-0.5"
              />
            )}
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="分享你今晚的心情或想法..."
              className="flex-1 text-sm text-brand-ink placeholder:text-zinc-400 resize-none outline-none min-h-[64px] bg-transparent"
              rows={3}
            />
          </div>
          <div className="flex justify-end mt-2">
            <button
              onClick={handlePost}
              disabled={!draftText.trim()}
              className="px-4 py-2 rounded-xl bg-brand-sky text-sm font-semibold text-brand-ink disabled:opacity-40 active:scale-95 transition-all"
            >
              發文
            </button>
          </div>
          {posted && (
            <p className="text-xs text-center text-brand-sky font-semibold mt-2">貼文已發布 ✓</p>
          )}
        </div>
      )}

      {/* Standard users: composer locked prompt */}
      {!canPost && (
        <div className="flex items-center gap-2 bg-brand-snow rounded-2xl border border-brand-lavender px-4 py-3 mb-4">
          <PenLine className="w-4 h-4 text-zinc-400 shrink-0" strokeWidth={1.75} />
          <p className="text-sm text-zinc-400">升級至進階會員即可在廣場發文</p>
        </div>
      )}

      {/* Feed */}
      <div className="flex flex-col gap-3">
        {posts.map((post) => {
          const author = state.users.find((u) => u.id === post.authorId);
          if (!author) return null;
          return (
            <MomentCard
              key={post.id}
              post={post}
              author={author}
              isVip={isVip}
              canInteract={true}
            />
          );
        })}
      </div>
    </div>
  );
}
