'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { useAppState } from '@/lib/state';
import type { ChatMessage } from '@/lib/mock';

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default function ChatPage({ params }: ChatPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { state, currentUser, sendChatMessage } = useAppState();

  // Thread id format: "u-001-u-002" (two user IDs joined by "-", each prefixed with "u")
  // Split by the pattern: find the two "u-NNN" segments
  const threadId = id;
  const userIdMatches = id.match(/u-\d+/g) ?? [];
  const otherUserId = userIdMatches.find((uid) => uid !== currentUser?.id) ?? userIdMatches[0] ?? '';
  const otherUser = state.users.find((u) => u.id === otherUserId);

  const isOtherOnline = state.onlineUserIds.includes(otherUserId);

  // Local messages: seeded from global state, new sends prepended locally
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>(() =>
    state.chatMessages.filter((m) => m.threadId === threadId)
  );
  const [inputText, setInputText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep synced if global state changes (e.g. reset)
  useEffect(() => {
    setLocalMessages(state.chatMessages.filter((m) => m.threadId === threadId));
  }, [state.chatMessages, threadId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages]);

  function handleSend() {
    const text = inputText.trim();
    if (!text) return;
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

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString('zh-Hant-TW', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-ice overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 pt-safe pb-3 pt-3 bg-white/80 backdrop-blur-md border-b border-brand-lavender shadow-sm shrink-0">
        <button
          onClick={() => router.back()}
          aria-label="返回"
          className="p-1.5 rounded-full hover:bg-brand-snow active:bg-brand-lavender transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-brand-ink" />
        </button>

        {/* Avatar */}
        <div className="relative shrink-0">
          <img
            src={otherUser?.avatarUrl ?? `https://i.pravatar.cc/150?u=${otherUserId}`}
            alt={otherUser?.nickname ?? '用戶'}
            className="w-9 h-9 rounded-full object-cover border border-brand-lavender"
          />
          {isOtherOnline && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-status-available border-2 border-white" />
          )}
        </div>

        {/* Name + status */}
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-sm text-brand-ink truncate leading-tight">
            {otherUser?.nickname ?? otherUserId}
          </span>
          <span className="text-xs text-muted-foreground leading-tight">
            {isOtherOnline ? '目前在線' : '離線'}
          </span>
        </div>
      </div>

      {/* Messages scroll area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {localMessages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">還沒有訊息，說聲 hi 吧！</p>
          </div>
        )}
        {localMessages.map((msg) => {
          const isMine = msg.senderId === currentUser?.id;
          return (
            <div
              key={msg.id}
              className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Other user avatar */}
              {!isMine && (
                <img
                  src={otherUser?.avatarUrl ?? `https://i.pravatar.cc/150?u=${otherUserId}`}
                  alt={otherUser?.nickname ?? ''}
                  className="w-7 h-7 rounded-full object-cover shrink-0 self-end border border-brand-lavender"
                />
              )}

              <div className={`flex flex-col gap-0.5 max-w-[72%] ${isMine ? 'items-end' : 'items-start'}`}>
                <div
                  className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                    isMine
                      ? 'bg-brand-sky text-brand-ink rounded-br-md'
                      : 'bg-white border border-brand-lavender text-brand-ink rounded-bl-md'
                  }`}
                >
                  {msg.text}
                </div>
                <span className="text-[10px] text-muted-foreground px-1">
                  {formatTime(msg.createdAt)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 flex items-center gap-2 px-4 pt-3 pb-safe pb-4 bg-white/90 backdrop-blur-md border-t border-brand-lavender">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="輸入訊息…"
          aria-label="輸入訊息"
          className="flex-1 bg-brand-snow border border-brand-lavender rounded-full px-4 py-2 text-sm text-brand-ink placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-sky focus:border-brand-sky transition-all"
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim()}
          aria-label="發送"
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-brand-sky text-brand-ink disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-95 active:scale-95 transition-all shadow-sm"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
