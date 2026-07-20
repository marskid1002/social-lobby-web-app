'use client';

import { use, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Heart, MessageCircle, Send, PenLine, CornerDownRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { useAppState } from '@/lib/state';

const PREMIUM_DAILY_LIMIT = 5;

function getDailyCommentKey(userId: string) {
  const today = new Date().toISOString().split('T')[0];
  return `sl_comment_count_${userId}_${today}`;
}

function getDailyCount(userId: string): number {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(getDailyCommentKey(userId)) ?? '0', 10);
}

function incrementDailyCount(userId: string): number {
  const next = getDailyCount(userId) + 1;
  localStorage.setItem(getDailyCommentKey(userId), String(next));
  return next;
}

export default function PostThreadPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = use(params);
  const router = useRouter();
  const { state, likePost, addPlazaComment } = useAppState();
  const inputRef = useRef<HTMLInputElement>(null);

  const post = state.momentPosts.find((p) => p.id === postId);
  const currentUser = state.users.find((u) => u.id === state.currentUserId);
  const tier = currentUser?.tier ?? 'free';
  const isVip = tier === 'vip';
  // 開放留言給登入客戶（standard 以上）；訪客(guest)/free 仍不可留言
  const canComment = tier !== 'guest' && tier !== 'free';

  const [commentText, setCommentText] = useState('');
  const [dailyCount, setDailyCount] = useState(() => getDailyCount(currentUser?.id ?? ''));
  // replyingTo: comment id + author nickname
  const [replyingTo, setReplyingTo] = useState<{ key: string; nickname: string } | null>(null);

  const hitLimit = !isVip && dailyCount >= PREMIUM_DAILY_LIMIT;
  const remainingCount = isVip ? Infinity : PREMIUM_DAILY_LIMIT - dailyCount;

  useEffect(() => {
    if (replyingTo) inputRef.current?.focus();
  }, [replyingTo]);

  if (!post) {
    return <div className="flex items-center justify-center py-20 text-zinc-400">找不到這則貼文</div>;
  }

  const author = state.users.find((u) => u.id === post.authorId);
  if (!author) return null;

  const isLiked = state.likedPostIds.includes(post.id);
  const canInteract = tier !== 'free';

  // 留言來源改為跨裝置同步的 state.plazaComments（保持與渲染相同的形狀：key/userId/text/minsAgo/replies）
  const postComments = state.plazaComments.filter((c) => c.postId === postId);
  const nowMs = Date.now();
  const minsAgoOf = (iso: string) => Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 60_000));
  const allComments = postComments
    .filter((c) => !c.parentId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((c) => ({
      key: c.id,
      userId: c.userId,
      text: c.text,
      minsAgo: minsAgoOf(c.createdAt),
      replies: postComments
        .filter((r) => r.parentId === c.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map((r) => ({ userId: r.userId, text: r.text, minsAgo: minsAgoOf(r.createdAt) })),
    }));

  const totalCommentCount = allComments.length + allComments.reduce((sum, c) => sum + c.replies.length, 0);

  function handleStartReply(key: string, nickname: string) {
    setReplyingTo({ key, nickname });
    inputRef.current?.focus();
  }

  function handleCancelReply() {
    setReplyingTo(null);
    setCommentText('');
  }

  function handleSubmit() {
    if (!commentText.trim() || !currentUser || hitLimit) return;
    addPlazaComment(postId, commentText.trim(), replyingTo?.key); // 跨裝置同步（回覆帶 parentId=留言 id）
    setReplyingTo(null);
    const next = incrementDailyCount(currentUser.id);
    setDailyCount(next);
    setCommentText('');
  }

  return (
    <div className="min-h-screen bg-brand-snow pb-20">
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
            <img src={author.avatarUrl} alt={author.nickname} className="w-10 h-10 rounded-full object-cover" />
          </button>
          <div>
            <button onClick={() => router.push(`/u/${author.id}`)} className="text-sm font-semibold text-brand-ink hover:underline">
              {author.nickname}
            </button>
            <p className="text-xs text-zinc-400">
              {formatDistanceToNow(new Date(post.createdAt), { locale: zhTW, addSuffix: true })}
            </p>
          </div>
        </div>

        <p className="text-base text-zinc-800 leading-relaxed mb-4">{post.content}</p>

        <div className="flex items-center gap-5 pt-3 border-t border-zinc-100">
          <button
            onClick={() => canInteract && likePost(post.id)}
            className={`flex items-center gap-1.5 text-sm font-semibold transition-colors ${isLiked ? 'text-red-500' : 'text-zinc-400'}`}
            aria-label="按讚"
          >
            <Heart className={`w-5 h-5 ${isLiked ? 'fill-red-500' : ''}`} strokeWidth={1.75} />
            {post.likeCount}
          </button>
          <div className="flex items-center gap-1.5 text-sm text-zinc-400">
            <MessageCircle className="w-5 h-5" strokeWidth={1.75} />
            {totalCommentCount} 則留言
          </div>
        </div>
      </div>

      {/* Comment threads */}
      <div className="flex flex-col bg-white divide-y divide-zinc-100">
        {allComments.length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-10">還沒有人留言，來第一個吧</p>
        )}

        {allComments.map((comment) => {
          const commenter = state.users.find((u) => u.id === comment.userId);
          if (!commenter) return null;
          const createdAt = new Date(Date.now() - comment.minsAgo * 60_000).toISOString();

          return (
            <div key={comment.key} className="px-4 pt-4 pb-2">
              {/* Top-level comment */}
              <div className="flex items-start gap-3">
                <button onClick={() => router.push(`/u/${commenter.id}`)}>
                  <img src={commenter.avatarUrl} alt={commenter.nickname} className="w-8 h-8 rounded-full object-cover shrink-0" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <button onClick={() => router.push(`/u/${commenter.id}`)} className="text-sm font-semibold text-brand-ink">
                      {commenter.nickname}
                    </button>
                    <span className="text-xs text-zinc-400">
                      {formatDistanceToNow(new Date(createdAt), { locale: zhTW, addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-700 leading-relaxed">{comment.text}</p>
                  {canComment && !hitLimit && (
                    <button
                      onClick={() => handleStartReply(comment.key, commenter.nickname)}
                      className="mt-1.5 text-xs text-zinc-400 hover:text-brand-sky transition-colors"
                    >
                      回覆
                    </button>
                  )}
                </div>
              </div>

              {/* Replies */}
              {comment.replies.length > 0 && (
                <div className="ml-11 mt-3 flex flex-col gap-3 border-l-2 border-brand-lavender pl-3">
                  {comment.replies.map((reply, ri) => {
                    const replier = state.users.find((u) => u.id === reply.userId);
                    if (!replier) return null;
                    const replyCreatedAt = new Date(Date.now() - reply.minsAgo * 60_000).toISOString();
                    return (
                      <div key={ri} className="flex items-start gap-2">
                        <button onClick={() => router.push(`/u/${replier.id}`)}>
                          <img src={replier.avatarUrl} alt={replier.nickname} className="w-6 h-6 rounded-full object-cover shrink-0" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 mb-0.5">
                            <button onClick={() => router.push(`/u/${replier.id}`)} className="text-xs font-semibold text-brand-ink">
                              {replier.nickname}
                            </button>
                            <span className="text-[11px] text-zinc-400">
                              {formatDistanceToNow(new Date(replyCreatedAt), { locale: zhTW, addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-700 leading-relaxed">{reply.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-2" />
            </div>
          );
        })}
      </div>

      {/* Comment input bar */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-107.5 bg-white border-t border-brand-lavender px-4 pt-2 pb-3 z-30">
        {canComment ? (
          <>
            {/* Reply indicator */}
            {replyingTo && (
              <div className="flex items-center gap-1.5 mb-2">
                <CornerDownRight size={12} className="text-zinc-400" />
                <span className="text-xs text-zinc-500">回覆 <span className="font-semibold text-brand-ink">@{replyingTo.nickname}</span></span>
                <button onClick={handleCancelReply} className="ml-auto text-xs text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-200">取消</button>
              </div>
            )}

            {/* Count indicator for premium */}
            {!isVip && !replyingTo && (
              <p className="text-[11px] text-zinc-400 text-right mb-1">
                {hitLimit ? '今日互動次數已達上限' : `今日剩餘 ${remainingCount} 次`}
              </p>
            )}

            <div className="flex items-center gap-3">
              {currentUser && (
                <img src={currentUser.avatarUrl} alt={currentUser.nickname} className="w-8 h-8 rounded-full object-cover shrink-0" />
              )}
              <input
                ref={inputRef}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder={hitLimit ? '今日互動次數已達上限' : replyingTo ? `回覆 @${replyingTo.nickname}...` : '留言...'}
                disabled={hitLimit}
                className="flex-1 bg-brand-snow rounded-full px-4 py-2 text-sm text-brand-ink placeholder:text-zinc-400 focus:outline-none border border-brand-lavender disabled:opacity-50"
              />
              <button
                onClick={handleSubmit}
                disabled={!commentText.trim() || hitLimit}
                className="w-9 h-9 rounded-full bg-brand-sky flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all shrink-0"
                aria-label="送出"
              >
                <Send size={15} className="text-brand-ink" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 py-1">
            <PenLine className="w-4 h-4 text-zinc-400 shrink-0" strokeWidth={1.75} />
            <p className="text-sm text-zinc-400">登入後即可留言</p>
          </div>
        )}
      </div>
    </div>
  );
}
