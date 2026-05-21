'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Clock, CheckCircle2 } from 'lucide-react';
import { useAppState } from '@/lib/state';
import type { ChatMessage } from '@/lib/mock';

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

function useCountdown(expiresAt: string | undefined) {
  const [remaining, setRemaining] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!expiresAt) return;

    function tick() {
      const diff = new Date(expiresAt!).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining('00:00:00');
        setExpired(true);
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setRemaining(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      );
      setExpired(false);
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return { remaining, expired };
}

export default function ChatPage({ params }: ChatPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { state, currentUser, sendChatMessage, confirmMeetup } = useAppState();

  const threadId = id;
  const userIdMatches = id.match(/u-\d+/g) ?? [];
  const otherUserId = userIdMatches.find((uid) => uid !== currentUser?.id) ?? userIdMatches[0] ?? '';
  const otherUser = state.users.find((u) => u.id === otherUserId);
  const isOtherOnline = state.onlineUserIds.includes(otherUserId);

  // Find the accepted private invite for this thread
  const activeInvite = state.invitations.find(
    (inv) =>
      inv.requestId === null &&
      inv.status === 'accepted' &&
      !inv.meetupConfirmed &&
      ((inv.fromUserId === state.currentUserId && inv.toUserId === otherUserId) ||
        (inv.toUserId === state.currentUserId && inv.fromUserId === otherUserId))
  );

  const { remaining, expired } = useCountdown(activeInvite?.chatExpiresAt);

  const isChatLocked = !activeInvite || expired || !!activeInvite?.meetupConfirmed;

  const [localMessages, setLocalMessages] = useState<ChatMessage[]>(() =>
    state.chatMessages.filter((m) => m.threadId === threadId)
  );
  const [inputText, setInputText] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalMessages(state.chatMessages.filter((m) => m.threadId === threadId));
  }, [state.chatMessages, threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages]);

  function handleSend() {
    const text = inputText.trim();
    if (!text || isChatLocked) return;
    const newMsg = sendChatMessage(threadId, text);
    setLocalMessages((prev) => [...prev, newMsg]);
    setInputText('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleConfirmMeetup() {
    if (!activeInvite) return;
    confirmMeetup(activeInvite.id, otherUserId);
    setConfirmOpen(false);
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString('zh-Hant-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  // Decide banner color based on time remaining
  const hoursLeft = activeInvite?.chatExpiresAt
    ? (new Date(activeInvite.chatExpiresAt).getTime() - Date.now()) / 3_600_000
    : 0;
  const timerUrgent = hoursLeft < 1;

  return (
    <div className="flex flex-col h-screen bg-gradient-ice overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-3 bg-white/80 backdrop-blur-md border-b border-brand-lavender shadow-sm shrink-0">
        <button
          onClick={() => router.back()}
          aria-label="返回"
          className="p-1.5 rounded-full hover:bg-brand-snow active:bg-brand-lavender transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-brand-ink" />
        </button>

        <div className="relative shrink-0">
          <img
            src={otherUser?.avatarUrl ?? ''}
            alt={otherUser?.nickname ?? '用戶'}
            className="w-9 h-9 rounded-full object-cover border border-brand-lavender"
          />
          {isOtherOnline && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-status-available border-2 border-white" />
          )}
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-semibold text-sm text-brand-ink truncate leading-tight">
            {otherUser?.nickname ?? otherUserId}
          </span>
          <span className="text-xs text-zinc-400 leading-tight">
            {isOtherOnline ? '目前在線' : '離線'}
          </span>
        </div>

        {/* Confirm meetup button */}
        {activeInvite && !expired && (
          <button
            onClick={() => setConfirmOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-brand-pink text-brand-ink text-xs font-semibold active:scale-95 transition-all shrink-0"
          >
            <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
            確認見面
          </button>
        )}
      </div>

      {/* Chat timer banner */}
      {activeInvite && !expired && !activeInvite.meetupConfirmed && (
        <div className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium shrink-0 ${
          timerUrgent ? 'bg-red-50 text-red-500' : 'bg-brand-ice text-zinc-500'
        }`}>
          <Clock className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          <span>聊天視窗將在 <span className={`font-bold tabular-nums ${timerUrgent ? 'text-red-500' : 'text-brand-ink'}`}>{remaining}</span> 後關閉</span>
        </div>
      )}

      {/* Expired banner */}
      {(expired || activeInvite?.meetupConfirmed) && (
        <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-100 text-zinc-500 text-xs font-medium shrink-0">
          <Clock className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          <span>
            {activeInvite?.meetupConfirmed
              ? '你們已確認見面 · 聊天已結束'
              : '聊天視窗已關閉 · 如需再次聯繫請重新發送邀請'}
          </span>
        </div>
      )}

      {/* No active invite (chat not unlocked) */}
      {!activeInvite && !state.invitations.some(
        (inv) => inv.requestId === null &&
          ((inv.fromUserId === state.currentUserId && inv.toUserId === otherUserId) ||
            (inv.toUserId === state.currentUserId && inv.fromUserId === otherUserId))
      ) && (
        <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 text-amber-600 text-xs font-medium shrink-0">
          需要先發送私人邀請並等對方接受才能聊天
        </div>
      )}

      {/* Messages scroll area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {localMessages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-zinc-400">還沒有訊息，說聲 hi 吧！</p>
          </div>
        )}
        {localMessages.map((msg) => {
          const isMine = msg.senderId === currentUser?.id;
          return (
            <div key={msg.id} className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
              {!isMine && (
                <img
                  src={otherUser?.avatarUrl ?? ''}
                  alt={otherUser?.nickname ?? ''}
                  className="w-7 h-7 rounded-full object-cover shrink-0 self-end border border-brand-lavender"
                />
              )}
              <div className={`flex flex-col gap-0.5 max-w-[72%] ${isMine ? 'items-end' : 'items-start'}`}>
                <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                  isMine
                    ? 'bg-brand-sky text-brand-ink rounded-br-md'
                    : 'bg-white border border-brand-lavender text-brand-ink rounded-bl-md'
                }`}>
                  {msg.text}
                </div>
                <span className="text-[10px] text-zinc-400 px-1">{formatTime(msg.createdAt)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar — locked when chat expired or meetup confirmed */}
      <div className="shrink-0 flex items-center gap-2 px-4 pt-3 pb-4 bg-white/90 backdrop-blur-md border-t border-brand-lavender">
        {isChatLocked ? (
          <div className="flex-1 flex items-center justify-center py-2">
            <p className="text-sm text-zinc-400">
              {activeInvite?.meetupConfirmed ? '聊天已結束' : '聊天視窗已關閉'}
            </p>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="輸入訊息…"
              aria-label="輸入訊息"
              className="flex-1 bg-brand-snow border border-brand-lavender rounded-full px-4 py-2 text-sm text-brand-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-sky transition-all"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              aria-label="發送"
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-brand-sky text-brand-ink disabled:opacity-40 active:scale-95 transition-all shadow-sm"
            >
              <Send className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Confirm meetup dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" onClick={() => setConfirmOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[340px] bg-white rounded-3xl p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-5">
              <div className="w-16 h-16 rounded-full bg-brand-pink flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">🌟</span>
              </div>
              <h3 className="text-lg font-semibold text-brand-ink mb-1">見面如何？</h3>
              <p className="text-sm text-zinc-500">
                確認你和 <span className="font-semibold">{otherUser?.nickname}</span> 已經見面了嗎？
              </p>
              <p className="text-xs text-zinc-400 mt-2">確認後聊天將關閉，她的檔案會顯示 ⭐ 標記</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 py-3 rounded-2xl border border-brand-lavender text-zinc-500 font-semibold text-sm active:scale-[0.98]"
              >
                還沒
              </button>
              <button
                onClick={handleConfirmMeetup}
                className="flex-1 py-3 rounded-2xl bg-brand-sky text-brand-ink font-semibold text-sm active:scale-[0.98] shadow-card"
              >
                確認見面 ⭐
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
