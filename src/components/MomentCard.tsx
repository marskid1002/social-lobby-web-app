'use client';

import { useRouter } from 'next/navigation';
import { Heart, MessageCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import type { MomentPost, User } from '@/lib/mock';
import { useAppState } from '@/lib/state';

interface Props {
  post: MomentPost;
  author: User;
}

export function MomentCard({ post, author }: Props) {
  const router = useRouter();
  const { state, likePost } = useAppState();
  const isLiked = state.likedPostIds.includes(post.id);
  const currentUser = state.users.find((u) => u.id === state.currentUserId);
  const canInteract = currentUser?.tier !== 'free';

  return (
    <div className="bg-white rounded-2xl border border-brand-lavender shadow-card overflow-hidden">
      {/* Tappable post body → thread view */}
      <button
        className="w-full text-left p-4 active:bg-brand-snow transition-colors"
        onClick={() => router.push(`/plaza/${post.id}`)}
      >
        {/* Author row */}
        <div className="flex items-center gap-2 mb-3">
          <img
            src={author.avatarUrl}
            alt={author.nickname}
            className="w-9 h-9 rounded-full object-cover shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-brand-ink truncate">{author.nickname}</p>
            <p className="text-xs text-zinc-400">
              {formatDistanceToNow(new Date(post.createdAt), { locale: zhTW, addSuffix: true })}
            </p>
          </div>
        </div>

        {/* Content */}
        <p className="text-sm text-zinc-700 leading-relaxed">{post.content}</p>

        {post.imageUrl && (
          <div className="rounded-xl overflow-hidden mt-3">
            <img src={post.imageUrl} alt="" className="w-full object-cover max-h-52" />
          </div>
        )}
      </button>

      {/* Action bar — separated so like tap doesn't navigate */}
      <div className="flex items-center gap-5 px-4 pb-3 pt-1 border-t border-zinc-50">
        <button
          onClick={() => canInteract && likePost(post.id)}
          className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${
            isLiked ? 'text-red-500' : 'text-zinc-400'
          }`}
          aria-label="按讚"
        >
          <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-500' : ''}`} strokeWidth={1.75} />
          {post.likeCount}
        </button>
        <button
          onClick={() => router.push(`/plaza/${post.id}`)}
          className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400"
          aria-label="查看留言"
        >
          <MessageCircle className="w-4 h-4" strokeWidth={1.75} />
          {post.commentCount}
        </button>
      </div>
    </div>
  );
}
