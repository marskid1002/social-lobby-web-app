'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Heart, MessageCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { useAppState } from '@/lib/state';

// Mock comment interactions seeded per post — keyed by postId
const MOCK_COMMENTS: Record<string, { userId: string; text: string; minsAgo: number }[]> = {
  'mp-001': [
    { userId: 'u-005', text: '這種事真的太常發生了 😅 上週我也遇到一樣的狀況', minsAgo: 20 },
    { userId: 'u-011', text: '那個位子你去了嗎？結果怎樣', minsAgo: 15 },
    { userId: 'u-002', text: '最後一個人去了，結果意外很好玩哈哈', minsAgo: 10 },
  ],
  'mp-002': [
    { userId: 'u-009', text: '是哪家？推薦一下！', minsAgo: 50 },
    { userId: 'u-005', text: '下次帶我去 🙋‍♀️', minsAgo: 40 },
  ],
  'mp-003': [
    { userId: 'u-002', text: '松山區的 The Diner 最近很不錯', minsAgo: 8 },
    { userId: 'u-015', text: '跟我說一聲，我也在松山', minsAgo: 6 },
    { userId: 'u-011', text: '今晚要去嗎，我也快下班了', minsAgo: 3 },
    { userId: 'u-009', text: '等我！', minsAgo: 1 },
    { userId: 'u-005', text: '我也想去 😭', minsAgo: 0 },
  ],
  'mp-004': [
    { userId: 'u-002', text: '辛苦了 🤍 週末要出來放鬆一下！', minsAgo: 35 },
  ],
  'mp-005': [
    { userId: 'u-009', text: '完全同意，平日的信義區才是真的好逛', minsAgo: 75 },
    { userId: 'u-011', text: '而且平日找位子超容易', minsAgo: 70 },
    { userId: 'u-003', text: '就是這樣！週末人太多根本聊不下去', minsAgo: 65 },
    { userId: 'u-005', text: '揪一天平日晚上出來啊', minsAgo: 60 },
  ],
  'mp-006': [
    { userId: 'u-002', text: '哪個品牌？我也想試試', minsAgo: 115 },
    { userId: 'u-011', text: 'Kavalan 或 Omar？', minsAgo: 110 },
  ],
};

export default function PostThreadPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = use(params);
  const router = useRouter();
  const { state, likePost } = useAppState();

  const post = state.momentPosts.find((p) => p.id === postId);
  const currentUser = state.users.find((u) => u.id === state.currentUserId);

  if (!post) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
        <p>找不到這則貼文</p>
      </div>
    );
  }

  const author = state.users.find((u) => u.id === post.authorId);
  if (!author) return null;

  const isLiked = state.likedPostIds.includes(post.id);
  const canInteract = currentUser?.tier !== 'free';
  const comments = MOCK_COMMENTS[postId] ?? [];

  return (
    <div className="min-h-screen bg-brand-snow pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-brand-lavender px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full bg-brand-snow flex items-center justify-center active:scale-95 transition-transform"
          aria-label="返回"
        >
          <ArrowLeft className="w-5 h-5 text-brand-ink" strokeWidth={1.75} />
        </button>
        <p className="text-base font-semibold text-brand-ink">貼文</p>
      </div>

      {/* Original post */}
      <div className="bg-white px-4 pt-5 pb-4 border-b border-zinc-100">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push(`/u/${author.id}`)}>
            <img
              src={author.avatarUrl}
              alt={author.nickname}
              className="w-10 h-10 rounded-full object-cover"
            />
          </button>
          <div>
            <button
              onClick={() => router.push(`/u/${author.id}`)}
              className="text-sm font-semibold text-brand-ink hover:underline"
            >
              {author.nickname}
            </button>
            <p className="text-xs text-zinc-400">
              {formatDistanceToNow(new Date(post.createdAt), { locale: zhTW, addSuffix: true })}
            </p>
          </div>
        </div>

        <p className="text-base text-zinc-800 leading-relaxed mb-4">{post.content}</p>

        {post.imageUrl && (
          <div className="rounded-xl overflow-hidden mb-4">
            <img src={post.imageUrl} alt="" className="w-full object-cover max-h-64" />
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-5 pt-3 border-t border-zinc-100">
          <button
            onClick={() => canInteract && likePost(post.id)}
            className={`flex items-center gap-1.5 text-sm font-semibold transition-colors ${
              isLiked ? 'text-red-500' : 'text-zinc-400'
            }`}
            aria-label="按讚"
          >
            <Heart className={`w-5 h-5 ${isLiked ? 'fill-red-500' : ''}`} strokeWidth={1.75} />
            {post.likeCount}
          </button>
          <div className="flex items-center gap-1.5 text-sm text-zinc-400">
            <MessageCircle className="w-5 h-5" strokeWidth={1.75} />
            {comments.length} 則留言
          </div>
        </div>
      </div>

      {/* Comments */}
      <div className="flex flex-col divide-y divide-zinc-100 bg-white">
        {comments.length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-10">還沒有人留言，來第一個吧</p>
        )}
        {comments.map((c, i) => {
          const commenter = state.users.find((u) => u.id === c.userId);
          if (!commenter) return null;
          const createdAt = new Date(Date.now() - c.minsAgo * 60_000).toISOString();
          return (
            <div key={i} className="flex items-start gap-3 px-4 py-4">
              <button onClick={() => router.push(`/u/${commenter.id}`)}>
                <img
                  src={commenter.avatarUrl}
                  alt={commenter.nickname}
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <button
                    onClick={() => router.push(`/u/${commenter.id}`)}
                    className="text-sm font-semibold text-brand-ink"
                  >
                    {commenter.nickname}
                  </button>
                  <span className="text-xs text-zinc-400">
                    {formatDistanceToNow(new Date(createdAt), { locale: zhTW, addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-zinc-700 leading-relaxed">{c.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
