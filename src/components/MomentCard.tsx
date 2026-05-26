'use client';

import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import type { MomentPost, User } from '@/lib/mock';
import { useAppState } from '@/lib/state';

interface Props {
  post: MomentPost;
  author: User;
  isVip: boolean;         // true if current user is VIP — unlocks 開啟對話 button
  canInteract: boolean;   // true if standard+ — can see content, like, view profile
}

export function MomentCard({ post, author, isVip, canInteract }: Props) {
  const router = useRouter();
  const { state, likePost } = useAppState();
  const isLiked = state.likedPostIds.includes(post.id);

  return (
    <div className="bg-white rounded-2xl border border-brand-lavender p-4 shadow-card">
      {/* Author row */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => canInteract && router.push(`/u/${author.id}`)} className="shrink-0">
          <img
            src={author.avatarUrl}
            alt={author.nickname}
            className="w-9 h-9 rounded-full object-cover"
          />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-brand-ink truncate">{author.nickname}</p>
          <p className="text-xs text-zinc-400">
            {formatDistanceToNow(new Date(post.createdAt), { locale: zhTW, addSuffix: true })}
          </p>
        </div>
      </div>

      {/* Post content */}
      <p className="text-sm text-zinc-700 leading-relaxed mb-3">{post.content}</p>

      {/* Optional image placeholder */}
      {post.imageUrl && (
        <div className="rounded-xl overflow-hidden mb-3">
          <img src={post.imageUrl} alt="" className="w-full object-cover max-h-52" />
        </div>
      )}

      {/* Actions row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Like */}
          <button
            onClick={() => canInteract && likePost(post.id)}
            className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${
              isLiked ? 'text-red-500' : 'text-zinc-400'
            }`}
          >
            <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-500' : ''}`} strokeWidth={1.75} />
            {post.likeCount}
          </button>
          {/* Comment count (display only) */}
          <span className="text-xs text-zinc-400">{post.commentCount} 則留言</span>
        </div>

        {/* 開啟對話 button — VIP only */}
        {isVip ? (
          <button
            onClick={() => router.push(`/u/${author.id}`)}
            className="px-3 py-1.5 rounded-xl bg-brand-sky text-xs font-semibold text-brand-ink active:scale-95 transition-all"
          >
            開啟對話
          </button>
        ) : (
          <button
            disabled
            className="px-3 py-1.5 rounded-xl bg-brand-snow border border-brand-lavender text-xs font-semibold text-zinc-400 flex items-center gap-1"
            title="升級至 VIP 即可直接開啟對話"
          >
            🔒 開啟對話
          </button>
        )}
      </div>
    </div>
  );
}
