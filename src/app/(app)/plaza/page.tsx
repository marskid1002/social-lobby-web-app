'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAppState } from '@/lib/state';
import { MomentCard } from '@/components/MomentCard';
import { PenLine, UserCog } from 'lucide-react';

const MANAGER_ROSTER_IDS = ['u-002', 'u-005', 'u-009', 'u-015'];

export default function PlazaPage() {
  const { state, currentUser, switchUser, createMomentPost } = useAppState();
  const router = useRouter();
  const tier = currentUser?.tier ?? 'free';
  const [draft, setDraft] = useState('');

  function handlePost() {
    if (!draft.trim()) return;
    createMomentPost(draft);
    setDraft('');
  }

  // Manager: read-only feed + roster quick-switch to post as a girl
  if (currentUser?.role === 'manager') {
    const posts = [...state.momentPosts].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const rosterGirls = MANAGER_ROSTER_IDS
      .map((id) => state.users.find((u) => u.id === id))
      .filter(Boolean) as typeof state.users;

    return (
      <div className="px-4 pt-4 pb-24">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <UserCog className="w-4 h-4 text-amber-600 shrink-0" strokeWidth={1.75} />
            <p className="text-sm font-bold text-amber-700">以成員身份在廣場操作</p>
          </div>
          <p className="text-xs text-amber-600 mb-3">選擇成員，以她的身份發文或留言</p>
          <div className="flex flex-col gap-2">
            {rosterGirls.map((girl) => {
              const online = state.onlineStatuses.find((s) => s.userId === girl.id);
              return (
                <button
                  key={girl.id}
                  onClick={() => { switchUser(girl.id); router.push('/plaza'); }}
                  className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 border border-amber-100 active:bg-amber-50 transition-colors"
                >
                  <div className="relative shrink-0">
                    <img src={girl.avatarUrl} alt={girl.nickname} className="w-8 h-8 rounded-full object-cover" />
                    {online && <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-400 rounded-full border border-white" />}
                  </div>
                  <span className="flex-1 text-sm font-semibold text-brand-ink text-left">{girl.nickname}</span>
                  <span className="text-xs text-purple-600 font-bold">切換 →</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {posts.map((post) => {
            const author = state.users.find((u) => u.id === post.authorId);
            if (!author) return null;
            return <MomentCard key={post.id} post={post} author={author} />;
          })}
        </div>
      </div>
    );
  }

  // Sort posts newest first
  const posts = [...state.momentPosts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="relative" style={{ minHeight: 'calc(100dvh - 57px - 56px)' }}>
      {/* Free users: blur first few posts + centered viewport lock overlay */}
      {tier === 'free' && (
        <div
          className="fixed z-10 flex items-center justify-center bg-white/60 backdrop-blur-[2px]"
          style={{ top: '57px', left: 0, right: 0, bottom: '56px' }}
        >
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <span className="text-3xl">🔒</span>
            <p className="text-base font-bold text-brand-ink">探索更多，認識更多</p>
            <p className="text-sm text-zinc-500">升級會員，進入社群廣場</p>
            <button
              disabled
              className="mt-1 px-6 py-2.5 rounded-xl bg-amber-400 text-white text-sm font-bold opacity-70 cursor-not-allowed"
            >
              了解會員方案
            </button>
          </div>
        </div>
      )}

    <div className={`px-4 pt-4 pb-24 ${tier === 'free' ? 'filter blur-[4px] pointer-events-none select-none' : ''}`}>
      {/* 發文編輯器（登入客戶可發；訪客提示登入）*/}
      {currentUser && currentUser.tier !== 'guest' ? (
        <div className="bg-white rounded-2xl border border-brand-lavender p-3 mb-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="分享一則動態…"
            rows={2}
            maxLength={300}
            className="w-full resize-none text-sm text-brand-ink placeholder:text-zinc-400 focus:outline-none bg-transparent"
            aria-label="發文內容"
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-zinc-300">{draft.length}/300</span>
            <button
              onClick={handlePost}
              disabled={!draft.trim()}
              className="px-4 py-1.5 rounded-full bg-brand-sky text-brand-ink text-sm font-bold disabled:opacity-40 active:scale-95 transition-all"
            >
              發文
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-brand-snow rounded-2xl border border-brand-lavender px-4 py-3 mb-4">
          <PenLine className="w-4 h-4 text-zinc-400 shrink-0" strokeWidth={1.75} />
          <p className="text-sm text-zinc-400">登入後即可發文</p>
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
            />
          );
        })}
      </div>
    </div>
    </div>
  );
}
