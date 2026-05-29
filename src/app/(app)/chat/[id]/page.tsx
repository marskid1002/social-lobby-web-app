'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Clock, CheckCircle } from 'lucide-react';
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
      if (diff <= 0) { setRemaining('00:00:00'); setExpired(true); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setRemaining(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
      setExpired(false);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return { remaining, expired };
}

function parseInviteMessage(message: string): { label: string; value: string }[] {
  return message
    .split('　') // full-width space used as separator
    .map((part) => {
      const idx = part.indexOf('：');
      if (idx === -1) return null;
      return { label: part.slice(0, idx), value: part.slice(idx + 1) };
    })
    .filter(Boolean) as { label: string; value: string }[];
}

const INVITE_EMOJIS: Record<string, string> = {
  '活動類型': '🎉',
  '地點': '📍',
  '時間': '🕐',
  '人數': '👥',
  '備註': '💬',
};

export default function ChatPage({ params }: ChatPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { state, currentUser, sendChatMessage, confirmMeetup } = useAppState();

  const threadId = id;
  const userIdMatches = id.match(/u-\d+/g) ?? [];
  const otherUserId = userIdMatches.find((uid) => uid !== currentUser?.id) ?? userIdMatches[0] ?? '';
  const otherUser = state.users.find((u) => u.id === otherUserId);
  const isOtherOnline = state.onlineUserIds.includes(otherUserId);

  const isEscort = currentUser?.role === 'escort';

  // Match any accepted invite between these two users — private or request-based
  const activeInvite = state.invitations.find(
    (inv) =>
      inv.status === 'accepted' &&
      !inv.meetupConfirmed &&
      ((inv.fromUserId === state.currentUserId && inv.toUserId === otherUserId) ||
        (inv.toUserId === state.currentUserId && inv.fromUserId === otherUserId))
  );

  const confirmedInvite = state.invitations.find(
    (inv) =>
      inv.meetupConfirmed &&
      ((inv.fromUserId === state.currentUserId && inv.toUserId === otherUserId) ||
        (inv.toUserId === state.currentUserId && inv.fromUserId === otherUserId))
  );

  const { remaining, expired } = useCountdown(activeInvite?.chatExpiresAt);
  const isChatLocked = !activeInvite || expired;

  // Only show messages from the current invite session onward
  const sessionStart = activeInvite?.respondedAt ?? confirmedInvite?.respondedAt;
  const filterMessages = (msgs: ChatMessage[]) =>
    sessionStart ? msgs.filter((m) => m.createdAt >= sessionStart) : msgs;

  const threadMessages = filterMessages(state.chatMessages.filter((m) => m.threadId === threadId));
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>(threadMessages);
  const [inputText, setInputText] = useState('');
  const [hasSentMessage, setHasSentMessage] = useState(false);
  const [xiaomeiInput, setXiaomeiInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Demo perspective switcher
  const [viewAs, setViewAs] = useState<'user' | 'xiaomei'>('user');
  const [xiaomeiConfirmSuccess, setXiaomeiConfirmSuccess] = useState(false);

  useEffect(() => {
    setLocalMessages(filterMessages(state.chatMessages.filter((m) => m.threadId === threadId)));
  }, [state.chatMessages, threadId, sessionStart]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages]);

  function handleSend() {
    const text = inputText.trim();
    if (!text || isChatLocked) return;
    setHasSentMessage(true);
    const newMsg = sendChatMessage(threadId, text);
    setLocalMessages((prev) => [...prev, newMsg]);
    setInputText('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleXiaomeiSend() {
    const text = xiaomeiInput.trim();
    if (!text) return;
    const newMsg = sendChatMessage(threadId, text, otherUserId);
    setLocalMessages((prev) => [...prev, newMsg]);
    setXiaomeiInput('');
  }

  function handleXiaomeiKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleXiaomeiSend(); }
  }

  function handleXiaomeiConfirm() {
    if (!activeInvite) return;
    confirmMeetup(activeInvite.id, otherUserId);
    setXiaomeiConfirmSuccess(true);
    setTimeout(() => {
      setXiaomeiConfirmSuccess(false);
      setViewAs('user');
    }, 1800);
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('zh-Hant-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  const hoursLeft = activeInvite?.chatExpiresAt
    ? (new Date(activeInvite.chatExpiresAt).getTime() - Date.now()) / 3_600_000
    : 0;
  const timerUrgent = hoursLeft < 1;

  const inviteParts = activeInvite?.message ? parseInviteMessage(activeInvite.message) : [];

  // ── Xiao Mei's view ──────────────────────────────────────────────────────────
  if (viewAs === 'xiaomei') {
    const xiaomeiUser = otherUser; // u-002
    const requesterUser = currentUser; // u-001

    return (
      <div
        className="flex flex-col h-screen overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #fdf2f8 0%, #fce7f3 55%, #faf5ff 100%)' }}
      >
        {/* Header — shows the requester (u-001), just like any chat header shows who you're talking to */}
        <div className="flex items-center gap-3 px-4 pt-3 pb-3 bg-white/85 backdrop-blur-md border-b border-pink-100 shadow-sm shrink-0">
          <button
            onClick={() => setViewAs('user')}
            aria-label="返回"
            className="p-1.5 rounded-full hover:bg-pink-50 active:bg-pink-100 transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-brand-ink" />
          </button>
          <div className="relative shrink-0">
            <img
              src={requesterUser?.avatarUrl ?? ''}
              alt={requesterUser?.nickname ?? ''}
              className="w-9 h-9 rounded-full object-cover border-2 border-pink-200"
            />
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-line-green border-2 border-white" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm text-brand-ink truncate block">{requesterUser?.nickname}</span>
            <span className="text-xs text-zinc-400">私人邀請 · 目前在線</span>
          </div>
          <span className="text-[10px] font-bold text-pink-500 bg-pink-100 px-2 py-1 rounded-full shrink-0">
            收到的邀請
          </span>
        </div>

        {/* Confirm meetup — sticky at top */}
        <button
          onClick={handleXiaomeiConfirm}
          className="shrink-0 w-full flex items-center justify-center gap-2 py-3 bg-line-green text-white font-semibold text-sm active:brightness-90 transition-all"
        >
          <CheckCircle className="w-4 h-4" />
          確認見面・結案
        </button>

        {/* Invite summary card */}
        {inviteParts.length > 0 && (
          <div
            className="shrink-0 mx-4 mt-3 mb-1 p-3.5 rounded-2xl border border-pink-200"
            style={{ background: 'rgba(253,242,248,0.92)' }}
          >
            <p className="text-[10px] font-bold text-pink-400 uppercase tracking-wider mb-2.5">邀請詳情</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {inviteParts.map(({ label, value }) => (
                <div key={label} className="flex items-start gap-1.5 min-w-0">
                  <span className="text-sm shrink-0 mt-0.5">{INVITE_EMOJIS[label] ?? '·'}</span>
                  <div className="min-w-0">
                    <p className="text-[10px] text-zinc-400 leading-none mb-0.5">{label}</p>
                    <p className="text-xs font-semibold text-brand-ink wrap-break-word">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages — Xiao Mei's perspective (her messages on right) */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {localMessages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-zinc-400">還沒有訊息</p>
            </div>
          )}
          {localMessages.map((msg) => {
            const isMine = msg.senderId === otherUserId; // Xiao Mei is u-002
            const senderUser = isMine ? xiaomeiUser : requesterUser;
            return (
              <div key={msg.id} className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                {!isMine && (
                  <img
                    src={senderUser?.avatarUrl ?? ''}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover shrink-0 border border-pink-200"
                  />
                )}
                <div className={`flex flex-col gap-0.5 max-w-[72%] ${isMine ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                      isMine
                        ? 'bg-pink-300 text-brand-ink rounded-br-md'
                        : 'bg-white border border-pink-100 text-brand-ink rounded-bl-md'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-zinc-400 px-1">{formatTime(msg.createdAt)}</span>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Xiao Mei's input bar */}
        <div className="shrink-0 flex items-center gap-2 px-4 pt-3 pb-6 bg-white/85 backdrop-blur-md border-t border-pink-100">
          <input
            type="text"
            value={xiaomeiInput}
            onChange={(e) => setXiaomeiInput(e.target.value)}
            onKeyDown={handleXiaomeiKeyDown}
            placeholder="王小美 輸入訊息…"
            aria-label="輸入訊息"
            className="flex-1 bg-pink-50 border border-pink-200 rounded-full px-4 py-2 text-sm text-brand-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-pink-300 transition-all"
          />
          <button
            onClick={handleXiaomeiSend}
            disabled={!xiaomeiInput.trim()}
            aria-label="發送"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-pink-300 text-brand-ink disabled:opacity-40 active:scale-95 transition-all shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        {/* Success overlay */}
        {xiaomeiConfirmSuccess && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm">
            <div className="w-20 h-20 rounded-full bg-line-green flex items-center justify-center mb-4">
              <CheckCircle className="w-10 h-10 text-white" strokeWidth={2.5} />
            </div>
            <p className="text-xl font-bold text-brand-ink mb-1">見面已確認！</p>
            <p className="text-sm text-zinc-400">即將返回…</p>
          </div>
        )}
      </div>
    );
  }

  // ── Already-met closed state ──────────────────────────────────────────────────
  if (confirmedInvite && !activeInvite) {
    return (
      <div className="flex flex-col h-screen bg-gradient-ice overflow-hidden">
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
              alt={otherUser?.nickname ?? ''}
              className="w-9 h-9 rounded-full object-cover border border-brand-lavender"
            />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-semibold text-sm text-brand-ink truncate">{otherUser?.nickname}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {localMessages.map((msg) => {
            const isMine = msg.senderId === currentUser?.id;
            return (
              <div key={msg.id} className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                {!isMine && (
                  <img
                    src={otherUser?.avatarUrl ?? ''}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover shrink-0 border border-brand-lavender"
                  />
                )}
                <div className={`flex flex-col gap-0.5 max-w-[72%] ${isMine ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed opacity-60 ${
                      isMine
                        ? 'bg-brand-sky text-brand-ink rounded-br-md'
                        : 'bg-white border border-brand-lavender text-brand-ink rounded-bl-md'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-zinc-400 px-1">{formatTime(msg.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 px-5 py-5 bg-white border-t border-brand-lavender text-center">
          <div className="w-12 h-12 rounded-full bg-brand-pink flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">⭐</span>
          </div>
          <p className="text-sm font-semibold text-brand-ink mb-1">
            {otherUser?.nickname} 確認你們已見面
          </p>
          <p className="text-xs text-zinc-400 mb-4">聊天已結束。想再見面嗎？重新發送私人邀請</p>
          <button
            onClick={() => router.push(`/u/${otherUserId}`)}
            className="px-6 py-2.5 rounded-2xl bg-brand-sky text-brand-ink font-semibold text-sm active:scale-95 transition-all shadow-card"
          >
            再次邀請 {otherUser?.nickname}
          </button>
        </div>
      </div>
    );
  }

  // ── User's normal chat view ───────────────────────────────────────────────────
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
      </div>

      {/* Escort-only: confirm meetup sticky banner */}
      {isEscort && activeInvite && !expired && (
        <button
          onClick={() => handleXiaomeiConfirm()}
          className="shrink-0 w-full flex items-center justify-center gap-2 py-3 bg-line-green text-white font-semibold text-sm active:brightness-90 transition-all"
        >
          <CheckCircle className="w-4 h-4" />
          確認見面・結案
        </button>
      )}

      {/* Timer banner */}
      {activeInvite && !expired && (
        <div
          className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium shrink-0 ${
            timerUrgent ? 'bg-red-50 text-red-500' : 'bg-brand-ice text-zinc-500'
          }`}
        >
          <Clock className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          <span>
            聊天視窗將在{' '}
            <span className={`font-bold tabular-nums ${timerUrgent ? 'text-red-500' : 'text-brand-ink'}`}>
              {remaining}
            </span>{' '}
            後關閉
          </span>
        </div>
      )}

      {/* Expired banner */}
      {expired && (
        <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-100 text-zinc-500 text-xs font-medium shrink-0">
          <Clock className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          <span>聊天視窗已關閉 · 如需再次聯繫請重新發送邀請</span>
        </div>
      )}

      {/* Messages */}
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
                <div
                  className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                    isMine
                      ? 'bg-brand-sky text-brand-ink rounded-br-md'
                      : 'bg-white border border-brand-lavender text-brand-ink rounded-bl-md'
                  }`}
                >
                  {msg.text}
                </div>
                <span className="text-[10px] text-zinc-400 px-1">{formatTime(msg.createdAt)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Demo switcher pill — appears after first message sent (hidden for real escort accounts) */}
      {hasSentMessage && !isEscort && (
        <div className="shrink-0 px-4 pb-2">
          <button
            onClick={() => setViewAs('xiaomei')}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl border-2 border-dashed border-pink-300 bg-pink-50 active:scale-[0.98] transition-all"
            aria-label="切換到王小美視角"
          >
            <span className="text-[10px] font-bold text-zinc-400 tracking-widest">DEMO</span>
            <span className="text-sm font-semibold text-brand-ink">切換到王小美視角 →</span>
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="shrink-0 flex items-center gap-2 px-4 pt-3 pb-4 bg-white/90 backdrop-blur-md border-t border-brand-lavender">
        {isChatLocked ? (
          <div className="flex-1 flex items-center justify-center py-2">
            <p className="text-sm text-zinc-400">聊天視窗已關閉</p>
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
    </div>
  );
}
