'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Clock, CheckCircle, Users, Image as ImageIcon } from 'lucide-react';
import { useAppState, otherIdFromThread } from '@/lib/state';
import { uploadChatImage } from '@/lib/image';
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
    .split('　')
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
  const { state, currentUser, sendChatMessage, confirmMeetup, confirmGroupAttendance } = useAppState();

  // 安全返回：PWA 從推播進來沒有上一頁記錄時，router.back() 會卡住 → 改導到收件匣
  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/inbox');
  };

  const threadId = id;
  // 只有 g- 後面真的對應到一個局(request/response)才算群組聊天；
  // 否則（例如參與者 id 恰好以 g- 開頭的自建小姐）當一般 1:1，避免走錯分支導致聊天壞掉。
  const gReqId = id.startsWith('g-') ? id.slice(2) : null;
  const isGroup = !!gReqId && (state.requests.some((r) => r.id === gReqId) || state.responses.some((r) => r.requestId === gReqId));
  const requestId = isGroup ? gReqId : null;

  // ── Group chat logic ──────────────────────────────────────────────────────
  const groupRequest = requestId ? state.requests.find((r) => r.id === requestId) : null;
  const groupCreator = groupRequest ? state.users.find((u) => u.id === groupRequest.creatorId) : null;
  const groupJoiners = groupRequest
    ? state.responses
        .filter((r) => r.requestId === groupRequest.id && r.responseStatus === 'joining')
        .map((r) => state.users.find((u) => u.id === r.userId))
        .filter(Boolean)
    : [];
  const groupInvites = groupRequest
    ? state.invitations.filter((i) => i.requestId === groupRequest.id && i.status === 'accepted')
    : [];
  const myGroupInvite = groupInvites.find((i) => i.fromUserId === currentUser?.id);
  const iAlreadyConfirmed = myGroupInvite?.meetupConfirmed ?? false;
  const allConfirmed = groupInvites.length > 0 && groupInvites.every((i) => i.meetupConfirmed);
  const groupChatExpiresAt = groupInvites[0]?.chatExpiresAt;

  const isEscort = currentUser?.role === 'escort';
  const isGroupCreator = groupRequest?.creatorId === currentUser?.id;

  // ── 1:1 chat logic ────────────────────────────────────────────────────────
  // 用邊界比對從 threadId 取另一方（支援註冊客戶 c-<uuid>，避免 /u-\d+/ 抓不到造成幹部代談失效）
  const otherUserId = !isGroup ? otherIdFromThread(id, currentUser?.id ?? '') : '';
  const otherUser = state.users.find((u) => u.id === otherUserId);
  const isOtherOnline = state.onlineUserIds.includes(otherUserId);

  const activeInvite = !isGroup
    ? state.invitations.find(
        (inv) =>
          inv.status === 'accepted' &&
          !inv.meetupConfirmed &&
          ((inv.fromUserId === state.currentUserId && inv.toUserId === otherUserId) ||
            (inv.toUserId === state.currentUserId && inv.fromUserId === otherUserId))
      )
    : null;

  const confirmedInvite = !isGroup
    ? state.invitations.find(
        (inv) =>
          inv.meetupConfirmed &&
          ((inv.fromUserId === state.currentUserId && inv.toUserId === otherUserId) ||
            (inv.toUserId === state.currentUserId && inv.fromUserId === otherUserId))
      )
    : null;

  const expiresAt = isGroup ? groupChatExpiresAt : activeInvite?.chatExpiresAt;
  const { remaining, expired } = useCountdown(expiresAt);
  const isChatLocked = isGroup ? (allConfirmed || expired) : (!activeInvite || expired);

  const sessionStart = isGroup
    ? groupInvites[0]?.respondedAt
    : (activeInvite?.respondedAt ?? confirmedInvite?.respondedAt);
  const filterMessages = (msgs: ChatMessage[]) =>
    sessionStart ? msgs.filter((m) => m.createdAt >= sessionStart) : msgs;

  const threadMessages = filterMessages(state.chatMessages.filter((m) => m.threadId === threadId));
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>(threadMessages);
  const [inputText, setInputText] = useState('');
  const [hasSentMessage, setHasSentMessage] = useState(false);
  const [xiaomeiInput, setXiaomeiInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const [viewAs, setViewAs] = useState<'user' | 'xiaomei'>('user');
  const [xiaomeiConfirmSuccess, setXiaomeiConfirmSuccess] = useState(false);
  const [groupConfirmSuccess, setGroupConfirmSuccess] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<string | null>(null); // 點圖放大
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');

  useEffect(() => {
    const next = filterMessages(state.chatMessages.filter((m) => m.threadId === threadId));
    // 只有在內容真的改變時才更新，避免每次輪詢都重建陣列造成畫面跳動
    setLocalMessages((prev) => {
      if (prev.length === next.length && prev.every((m, i) => m.id === next[i]?.id)) return prev;
      return next;
    });
  }, [state.chatMessages, threadId, sessionStart]);

  // 只在「訊息數量增加」（有新訊息）時才捲到底，避免輪詢時把使用者拉回底部
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    if (localMessages.length > prevMsgCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMsgCountRef.current = localMessages.length;
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

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允許重選同一張
    if (!file || isChatLocked || photoBusy) return;
    setPhotoBusy(true);
    setPhotoError('');
    try {
      const url = await uploadChatImage(file);
      setHasSentMessage(true);
      const newMsg = sendChatMessage(threadId, '', undefined, url);
      setLocalMessages((prev) => [...prev, newMsg]);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : '照片上傳失敗');
      setTimeout(() => setPhotoError(''), 6000);
    } finally {
      setPhotoBusy(false);
    }
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

  function handleGroupConfirm() {
    if (!requestId) return;
    confirmGroupAttendance(requestId);
    setGroupConfirmSuccess(true);
    setTimeout(() => setGroupConfirmSuccess(false), 2000);
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('zh-Hant-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  const hoursLeft = expiresAt ? (new Date(expiresAt).getTime() - Date.now()) / 3_600_000 : 0;
  const timerUrgent = hoursLeft < 1;

  const inviteParts = activeInvite?.message ? parseInviteMessage(activeInvite.message) : [];

  // ── Group chat view ───────────────────────────────────────────────────────
  if (isGroup && groupRequest) {
    const allParticipants = [groupCreator, ...groupJoiners].filter(Boolean);
    const confirmedCount = groupInvites.filter((i) => i.meetupConfirmed).length;

    return (
      <div className="flex flex-col h-screen bg-gradient-ice overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-3 pb-3 bg-white/80 backdrop-blur-md border-b border-brand-lavender shadow-sm shrink-0">
          <button
            onClick={goBack}
            aria-label="返回"
            className="p-1.5 rounded-full hover:bg-brand-snow active:bg-brand-lavender transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-brand-ink" />
          </button>
          {/* Stacked avatars */}
          <div className="relative w-10 h-9 shrink-0">
            {allParticipants.slice(0, 3).map((u, idx) => (
              <img
                key={u!.id}
                src={u!.avatarUrl}
                alt={u!.nickname}
                className="absolute w-7 h-7 rounded-full object-cover border-2 border-white"
                style={{ left: idx * 10, zIndex: 3 - idx }}
              />
            ))}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-semibold text-sm text-brand-ink truncate leading-tight">
              {groupRequest.area} · {groupRequest.requestType === 'after_party' ? 'After Party' : groupRequest.requestType} 群組
            </span>
            <span className="text-xs text-zinc-400 leading-tight">
              {allParticipants.length} 人 · {confirmedCount}/{groupInvites.length} 已確認見面
            </span>
          </div>
          <button
            onClick={() => router.push(`/requests/${groupRequest.id}`)}
            className="shrink-0 p-1.5 rounded-full hover:bg-brand-snow"
            aria-label="查看邀請詳情"
          >
            <Users className="w-4 h-4 text-zinc-500" strokeWidth={1.75} />
          </button>
        </div>

        {/* Escort confirm attendance banner */}
        {isEscort && !isGroupCreator && !iAlreadyConfirmed && !expired && (
          <button
            onClick={handleGroupConfirm}
            className="shrink-0 w-full flex items-center justify-center gap-2 py-3 bg-line-green text-white font-semibold text-sm active:brightness-90 transition-all"
          >
            <CheckCircle className="w-4 h-4" />
            確認見面・標記出席
          </button>
        )}
        {isEscort && iAlreadyConfirmed && (
          <div className="shrink-0 flex items-center justify-center gap-2 py-2.5 bg-green-50 text-green-600 text-xs font-semibold">
            <CheckCircle className="w-3.5 h-3.5" strokeWidth={2} />
            你已確認見面
          </div>
        )}

        {/* Attendance progress bar */}
        {groupInvites.length > 0 && (
          <div className="shrink-0 px-4 py-2 bg-white/60 border-b border-brand-lavender">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-brand-lavender overflow-hidden">
                <div
                  className="h-full rounded-full bg-line-green transition-all"
                  style={{ width: `${(confirmedCount / groupInvites.length) * 100}%` }}
                />
              </div>
              <span className="text-[11px] text-zinc-500 shrink-0">
                {confirmedCount}/{groupInvites.length} 確認出席
                {allConfirmed ? ' · 結案 ✅' : ''}
              </span>
            </div>
          </div>
        )}

        {/* Timer */}
        {!allConfirmed && expiresAt && !expired && (
          <div className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium shrink-0 ${timerUrgent ? 'bg-red-50 text-red-500' : 'bg-brand-ice text-zinc-500'}`}>
            <Clock className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            <span>
              聊天視窗將在{' '}
              <span className={`font-bold tabular-nums ${timerUrgent ? 'text-red-500' : 'text-brand-ink'}`}>{remaining}</span>
              {' '}後關閉
            </span>
          </div>
        )}
        {expired && !allConfirmed && (
          <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-100 text-zinc-500 text-xs font-medium shrink-0">
            <Clock className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            <span>聊天視窗已關閉</span>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {localMessages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-zinc-400">群組聊天已開啟，說聲 hi 吧！</p>
            </div>
          )}
          {localMessages.map((msg) => {
            const isMine = msg.senderId === currentUser?.id;
            const sender = state.users.find((u) => u.id === msg.senderId);
            return (
              <div key={msg.id} className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                {!isMine && (
                  <img
                    src={sender?.avatarUrl ?? ''}
                    alt={sender?.nickname ?? ''}
                    className="w-7 h-7 rounded-full object-cover shrink-0 self-end border border-brand-lavender"
                  />
                )}
                <div className={`flex flex-col gap-0.5 max-w-[72%] ${isMine ? 'items-end' : 'items-start'}`}>
                  {!isMine && sender && (
                    <span className="text-[10px] text-zinc-400 px-1">{sender.nickname}</span>
                  )}
                  <div
                    className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                      isMine
                        ? 'bg-brand-sky text-brand-ink rounded-br-md'
                        : 'bg-white border border-brand-lavender text-brand-ink rounded-bl-md'
                    }`}
                  >
                    {msg.imageUrl ? (
                      <img
                        src={msg.imageUrl}
                        alt="照片"
                        onClick={() => setLightbox(msg.imageUrl!)}
                        className="block rounded-xl max-w-[200px] max-h-[240px] object-cover cursor-pointer active:opacity-90"
                      />
                    ) : msg.text}
                  </div>
                  <span className="text-[10px] text-zinc-400 px-1">{formatTime(msg.createdAt)}</span>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 flex items-center gap-2 px-4 pt-3 pb-4 bg-white/90 backdrop-blur-md border-t border-brand-lavender">
          {isChatLocked ? (
            <div className="flex-1 flex items-center justify-center py-2">
              <p className="text-sm text-zinc-400">{allConfirmed ? '所有人已確認見面，聊天已結案' : '聊天視窗已關閉'}</p>
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

        {/* Group confirm success overlay */}
        {groupConfirmSuccess && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm">
            <div className="w-20 h-20 rounded-full bg-line-green flex items-center justify-center mb-4">
              <CheckCircle className="w-10 h-10 text-white" strokeWidth={2.5} />
            </div>
            <p className="text-xl font-bold text-brand-ink mb-1">出席已確認！</p>
            <p className="text-sm text-zinc-400">等待其他人確認…</p>
          </div>
        )}
      </div>
    );
  }

  // ── Xiao Mei's view (1:1 only) ────────────────────────────────────────────
  if (viewAs === 'xiaomei') {
    const xiaomeiUser = otherUser;
    const requesterUser = currentUser;

    return (
      <div
        className="flex flex-col h-screen overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #fdf2f8 0%, #fce7f3 55%, #faf5ff 100%)' }}
      >
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

        <button
          onClick={handleXiaomeiConfirm}
          className="shrink-0 w-full flex items-center justify-center gap-2 py-3 bg-line-green text-white font-semibold text-sm active:brightness-90 transition-all"
        >
          <CheckCircle className="w-4 h-4" />
          確認見面・結案
        </button>

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

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {localMessages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-zinc-400">還沒有訊息</p>
            </div>
          )}
          {localMessages.map((msg) => {
            const isMine = msg.senderId === otherUserId;
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
                    {msg.imageUrl ? (
                      <img
                        src={msg.imageUrl}
                        alt="照片"
                        onClick={() => setLightbox(msg.imageUrl!)}
                        className="block rounded-xl max-w-[200px] max-h-[240px] object-cover cursor-pointer active:opacity-90"
                      />
                    ) : msg.text}
                  </div>
                  <span className="text-[10px] text-zinc-400 px-1">{formatTime(msg.createdAt)}</span>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="shrink-0 flex items-center gap-2 px-4 pt-3 pb-6 bg-white/85 backdrop-blur-md border-t border-pink-100">
          <input
            type="text"
            value={xiaomeiInput}
            onChange={(e) => setXiaomeiInput(e.target.value)}
            onKeyDown={handleXiaomeiKeyDown}
            placeholder={`${otherUser?.nickname ?? '對方'} 輸入訊息…`}
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

  // ── Already-met closed state (1:1) ────────────────────────────────────────
  if (confirmedInvite && !activeInvite) {
    return (
      <div className="flex flex-col h-screen bg-gradient-ice overflow-hidden">
        <div className="flex items-center gap-3 px-4 pt-3 pb-3 bg-white/80 backdrop-blur-md border-b border-brand-lavender shadow-sm shrink-0">
          <button
            onClick={goBack}
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
                    {msg.imageUrl ? (
                      <img
                        src={msg.imageUrl}
                        alt="照片"
                        onClick={() => setLightbox(msg.imageUrl!)}
                        className="block rounded-xl max-w-[200px] max-h-[240px] object-cover cursor-pointer active:opacity-90"
                      />
                    ) : msg.text}
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

  // ── Normal 1:1 chat view ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gradient-ice overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-3 pb-3 bg-white/80 backdrop-blur-md border-b border-brand-lavender shadow-sm shrink-0">
        <button
          onClick={goBack}
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

      {isEscort && activeInvite && !expired && (
        <button
          onClick={() => handleXiaomeiConfirm()}
          className="shrink-0 w-full flex items-center justify-center gap-2 py-3 bg-line-green text-white font-semibold text-sm active:brightness-90 transition-all"
        >
          <CheckCircle className="w-4 h-4" />
          確認見面・結案
        </button>
      )}

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

      {expired && (
        <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-100 text-zinc-500 text-xs font-medium shrink-0">
          <Clock className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          <span>聊天視窗已關閉 · 如需再次聯繫請重新發送邀請</span>
        </div>
      )}

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

      {/* DEMO 專用：切換到對方視角，僅示範模式顯示，正式環境不出現 */}
      {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && hasSentMessage && !isEscort && (
        <div className="shrink-0 px-4 pb-2">
          <button
            onClick={() => setViewAs('xiaomei')}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl border-2 border-dashed border-pink-300 bg-pink-50 active:scale-[0.98] transition-all"
            aria-label="切換到對方視角（示範）"
          >
            <span className="text-[10px] font-bold text-zinc-400 tracking-widest">DEMO</span>
            <span className="text-sm font-semibold text-brand-ink">切換到對方視角 →</span>
          </button>
        </div>
      )}

      <div className="shrink-0 bg-white/90 backdrop-blur-md border-t border-brand-lavender">
        {photoError && (
          <p className="px-4 pt-2 text-xs text-red-500 text-center break-words">⚠️ {photoError}</p>
        )}
        <div className="flex items-center gap-2 px-4 pt-3 pb-4">
          {isChatLocked ? (
            <div className="flex-1 flex items-center justify-center py-2">
              <p className="text-sm text-zinc-400">聊天視窗已關閉</p>
            </div>
          ) : (
            <>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelected} />
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={photoBusy}
                aria-label="傳送照片"
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-brand-snow border border-brand-lavender text-brand-sky disabled:opacity-40 active:scale-95 transition-all"
              >
                <ImageIcon className="w-4 h-4" />
              </button>
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={photoBusy ? '照片上傳中…' : '輸入訊息…'}
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

      {/* 照片放大檢視 */}
      {lightbox && (
        <div className="fixed inset-0 z-[90] bg-black/85 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="照片" className="max-w-full max-h-full rounded-2xl object-contain" />
          <button
            onClick={() => setLightbox(null)}
            aria-label="關閉"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 text-white flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 rotate-45" />
          </button>
        </div>
      )}
    </div>
  );
}
