'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { X, Check, UserCog, Camera } from 'lucide-react';


const TYPE_LABELS: Record<string, string> = {
  after_party: 'After Party',
  drinking: '喝一杯',
  fill_spot: '補位',
  last_minute: '臨時局',
  other: '其他',
};

const TYPE_COLORS: Record<string, string> = {
  after_party: '#F7BEF1',
  drinking: '#F59E0B',
  fill_spot: '#8BD8F1',
  last_minute: '#EF4444',
  other: '#DED9E5',
};

// 上傳前先在前端縮圖並轉成 JPEG：手機相簿常是數 MB 大圖或 iPhone HEIC，
// 直接上傳會超過請求大小限制或無法顯示；縮到最長邊 1280、品質 0.82 可大幅縮小並轉成通用格式。
async function downscaleToJpegDataUrl(file: File, maxDim = 1280, quality = 0.82): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('image load failed'));
      im.src = objectUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function OperatorHome() {
  const { state, dispatchGirl, switchToRosterGirl, setRoster, setUserPresence, setPhotoOverride, resetPhotoOverride, addGalleryPhoto, removeGalleryPhoto, updateUser } = useAppState();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const uploadModeRef = useRef<'avatar' | 'gallery'>('avatar');
  const [photoSheetGirlId, setPhotoSheetGirlId] = useState<string | null>(null); // 開啟照片管理彈窗的小姐
  const [uploading, setUploading] = useState(false);

  const galleryOf = (userId: string) => state.photoGalleries.find((g) => g.id === userId)?.urls ?? [];

  function pickAvatar() { uploadModeRef.current = 'avatar'; photoInputRef.current?.click(); }
  function pickGallery() { uploadModeRef.current = 'gallery'; photoInputRef.current?.click(); }

  async function uploadImage(girlId: string, file: File): Promise<string | null> {
    // 先縮圖轉 JPEG（相容手機大圖 / HEIC）；縮圖失敗才退回原始檔
    let dataUrl: string;
    try {
      dataUrl = await downscaleToJpegDataUrl(file);
    } catch {
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: girlId, dataUrl }),
    });
    if (!res.ok) return null; // 讓呼叫端顯示「上傳失敗」
    const data = await res.json();
    return data.url ?? null;
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const girlId = photoSheetGirlId;
    const mode = uploadModeRef.current;
    e.target.value = ''; // 允許重選同一檔
    if (!file || !girlId) return;
    setUploading(true);
    try {
      const url = await uploadImage(girlId, file);
      if (url) {
        if (mode === 'avatar') { setPhotoOverride(girlId, url); setToast('✅ 已更新大頭照'); }
        else { addGalleryPhoto(girlId, url); setToast('✅ 已加入相簿'); }
      } else {
        setToast('⚠️ 上傳失敗');
      }
    } catch {
      setToast('⚠️ 上傳失敗');
    } finally {
      setUploading(false);
      setTimeout(() => setToast(''), 2500);
    }
  }

  function handleResetPhoto(girlId: string) {
    resetPhotoOverride(girlId);
    setToast('已還原原始大頭照');
    setTimeout(() => setToast(''), 2500);
  }
  const router = useRouter();
  const [dispatchSheet, setDispatchSheet] = useState<string | null>(null); // requestId
  const [selectedGirls, setSelectedGirls] = useState<string[]>([]); // 多選
  const [toast, setToast] = useState('');
  const [rosterEditOpen, setRosterEditOpen] = useState(false);
  const [rosterDraft, setRosterDraft] = useState<string[]>([]);
  const [nameDraft, setNameDraft] = useState('');

  // 目前幹部的女伴名單（可自行設定，存本機）
  const currentRosterIds = state.rosters.find((r) => r.id === state.currentUserId)?.girlIds ?? [];

  // 所有可加入名單的女伴（escort 角色）
  const allEscorts = state.users.filter((u) => u.role === 'escort');

  function openRosterEdit() {
    setRosterDraft(currentRosterIds);
    setRosterEditOpen(true);
  }
  function toggleRosterDraft(girlId: string) {
    setRosterDraft((prev) =>
      prev.includes(girlId) ? prev.filter((id) => id !== girlId) : [...prev, girlId]
    );
  }
  function saveRoster() {
    setRoster(state.currentUserId, rosterDraft);
    setRosterEditOpen(false);
    setToast('✅ 已更新女伴名單');
    setTimeout(() => setToast(''), 2500);
  }

  // 新進活動邀請：所有 open 狀態、由 VIP/一般用戶或任一幹部（含自己）發的局
  const incomingRequests = state.requests
    .filter((r) => {
      if (r.status !== 'open') return false;
      const creator = state.users.find((u) => u.id === r.creatorId);
      if (!creator) return false;
      return creator.role === 'user' || creator.role === 'manager';
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const rosterGirls = currentRosterIds.map((id) => state.users.find((u) => u.id === id)).filter(Boolean);

  // 該局已派工的旗下女伴 id（interested 或 joining）
  function dispatchedGirlIds(requestId: string) {
    return state.responses
      .filter(
        (r) =>
          r.requestId === requestId &&
          currentRosterIds.includes(r.userId) &&
          (r.responseStatus === 'interested' || r.responseStatus === 'joining')
      )
      .map((r) => r.userId);
  }

  // #5 派工無上限：不再以 peopleCount 鎖定卡片（只有 closed 才視為結束）
  function isRequestClosed(req: { id: string; status: string }) {
    return req.status === 'closed';
  }

  // 開啟派工彈窗的局物件
  const activeReq = dispatchSheet ? state.requests.find((r) => r.id === dispatchSheet) : null;
  const alreadyDispatched = dispatchSheet ? dispatchedGirlIds(dispatchSheet) : [];

  function toggleGirl(girlId: string) {
    setSelectedGirls((prev) =>
      prev.includes(girlId) ? prev.filter((id) => id !== girlId) : [...prev, girlId]
    );
  }

  function handleDispatch() {
    if (!dispatchSheet || selectedGirls.length === 0) return;
    const names = selectedGirls
      .map((id) => state.users.find((u) => u.id === id)?.nickname)
      .filter(Boolean)
      .join('、');
    selectedGirls.forEach((girlId) => dispatchGirl(dispatchSheet, girlId));
    setDispatchSheet(null);
    setSelectedGirls([]);
    setToast(`✅ 已安排 ${names} 出席，通知已發送`);
    setTimeout(() => setToast(''), 3000);
  }

  // 首登強制設定顯示名稱：幹部在 registeredUsers 尚無自己的紀錄（＝從沒設過），
  // 就擋住後台、要求先設定暱稱（設定後會同步、也會顯示給客戶）。
  const needsNickname = !state.registeredUsers.some((u) => u.id === state.currentUserId);
  if (needsNickname) {
    const me = state.users.find((u) => u.id === state.currentUserId);
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-full max-w-sm bg-white rounded-3xl border border-brand-lavender p-6 shadow-card">
          <div className="text-3xl mb-2">👋</div>
          <h1 className="text-base font-bold text-brand-ink mb-1">設定你的顯示名稱</h1>
          <p className="text-sm text-zinc-500 mb-4">這會顯示給客戶看，設定後才能開始使用後台。</p>
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder={me?.nickname ? `目前：${me.nickname}` : '輸入顯示名稱'}
            maxLength={20}
            className="w-full rounded-xl border border-brand-lavender bg-brand-snow px-4 py-3 text-sm text-brand-ink focus:outline-none focus:border-brand-sky mb-4"
            aria-label="顯示名稱"
          />
          <button
            onClick={() => { const n = nameDraft.trim(); if (n) updateUser({ nickname: n }); }}
            disabled={!nameDraft.trim()}
            className="w-full py-3 rounded-xl bg-purple-500 text-white text-sm font-bold disabled:opacity-40 active:bg-purple-600 transition-colors"
          >
            儲存並開始
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        <p className="text-sm font-bold text-brand-ink uppercase tracking-wider mb-4">新進活動邀請</p>

        <div className="flex flex-col gap-3">
          {incomingRequests.map((req) => {
            const creator = state.users.find((u) => u.id === req.creatorId);
            const dispatchedCount = dispatchedGirlIds(req.id).length;
            const isFull = isRequestClosed(req); // #5 只有已關閉才鎖定
            const typeColor = TYPE_COLORS[req.requestType] ?? '#DED9E5';
            const typeLabel = TYPE_LABELS[req.requestType] ?? req.requestType;

            return (
              <div key={req.id} className={`bg-white rounded-2xl border border-brand-lavender p-4 shadow-sm transition-opacity ${isFull ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-2 mb-2">
                  {creator && (
                    <img src={creator.avatarUrl} alt={creator.nickname} className="w-8 h-8 rounded-full object-cover" />
                  )}
                  <div className="flex-1 min-w-0">
                    {creator && <p className="text-sm font-semibold text-brand-ink truncate">{creator.nickname}</p>}
                  </div>
                  <span className="text-xs text-zinc-400 shrink-0">
                    {formatDistanceToNow(new Date(req.createdAt), { locale: zhTW, addSuffix: true })}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-brand-ink"
                    style={{ backgroundColor: typeColor }}
                  >
                    {typeLabel}
                  </span>
                  <span className="text-xs text-zinc-500">{req.area} · {req.peopleCount} 人</span>
                </div>

                <p className="text-sm text-zinc-700 line-clamp-2 mb-3">{req.note}</p>

                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/requests/${req.id}`)}
                    className="flex-1 py-2.5 rounded-xl border border-brand-lavender text-sm font-semibold text-brand-ink bg-white active:bg-brand-snow transition-colors"
                  >
                    查看
                  </button>
                  {isFull ? (
                    <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-400">
                      <Check size={14} />
                      <span>已結束（已安排 {dispatchedCount} 位）</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setDispatchSheet(req.id); setSelectedGirls([]); }}
                      className="flex-1 py-2.5 rounded-xl bg-purple-100 text-sm font-semibold text-purple-700 border border-purple-200 active:bg-purple-200 transition-colors"
                    >
                      {dispatchedCount > 0 ? `再安排（已 ${dispatchedCount} 位）` : '安排出席'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 人員管理：名單 + 上線狀態 + 照片 + 以其身份操作（單一區塊） */}
      <div className="flex items-center gap-3 px-4 py-3 mt-2 bg-brand-snow border-y border-zinc-100">
        <p className="text-sm font-bold text-brand-ink uppercase tracking-wider flex-1">人員管理（{currentRosterIds.length}）</p>
        <button
          onClick={openRosterEdit}
          className="shrink-0 text-[11px] font-bold text-purple-600 bg-purple-50 border border-purple-200 px-2.5 py-1.5 rounded-full active:bg-purple-100 transition-colors"
        >
          編輯名單
        </button>
      </div>

      {rosterGirls.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-zinc-400">尚未設定名單</p>
          <button onClick={openRosterEdit} className="mt-2 text-xs font-bold text-purple-600 underline">點此設定</button>
        </div>
      ) : (
        <div>
          {rosterGirls.map((user) => {
            if (!user) return null;
            const isOnline = state.onlineUserIds.includes(user.id);
            const galleryCount = galleryOf(user.id).length;
            return (
              <div key={user.id} className="flex items-center gap-2 px-4 py-3 bg-white border-b border-zinc-100">
                <div className="relative shrink-0">
                  <img src={user.avatarUrl} alt={user.nickname} className="w-10 h-10 rounded-full object-cover" />
                  <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${isOnline ? 'bg-green-400' : 'bg-zinc-300'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-brand-ink truncate">{user.nickname}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {isOnline ? '🟢 上線中' : '⚪ 離線'}
                    {galleryCount > 0 && <span className="ml-2 text-brand-sky">相簿 {galleryCount}</span>}
                  </p>
                </div>
                {/* 上線/下班（跨裝置同步）*/}
                <button
                  onClick={() => setUserPresence(user.id, !isOnline)}
                  className={`shrink-0 px-2 py-1.5 rounded-full border text-[11px] font-bold transition-colors ${isOnline ? 'bg-green-50 border-green-200 text-green-700 active:bg-green-100' : 'bg-zinc-100 border-zinc-200 text-zinc-400 active:bg-zinc-200'}`}
                  aria-label={`${isOnline ? '設為下班' : '設為上班'}：${user.nickname}`}
                >
                  {isOnline ? '上班' : '下班'}
                </button>
                {/* 編輯照片（大頭照 + 相簿）*/}
                <button
                  onClick={() => setPhotoSheetGirlId(user.id)}
                  className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-full border border-brand-sky/30 bg-brand-sky/10 text-[11px] font-bold text-brand-sky active:opacity-80"
                  aria-label={`編輯 ${user.nickname} 的照片`}
                >
                  <Camera size={12} />照片
                </button>
                {/* 以其身份操作 */}
                <button
                  onClick={() => { switchToRosterGirl(user.id); router.push('/requests'); }}
                  className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-full border border-purple-200 bg-purple-50 text-[11px] font-bold text-purple-600 active:bg-purple-100"
                  aria-label={`以 ${user.nickname} 身份操作`}
                >
                  <UserCog size={12} />操作
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 隱藏檔案輸入（編輯照片用）*/}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoChange}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-brand-ink text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-lg z-50 whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* Dispatch bottom sheet */}
      {dispatchSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setDispatchSheet(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[430px] bg-white rounded-t-[28px] p-5 pb-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-4" />
            <p className="text-base font-bold text-brand-ink text-center">安排出席人選</p>
            <p className="text-xs text-zinc-400 mb-4 text-center">
              此局目標 {activeReq?.peopleCount ?? 0} 人（可超額安排）
              {selectedGirls.length > 0 && `· 已選 ${selectedGirls.length}`}
            </p>

            <div className="flex flex-col gap-2 mb-5">
              {rosterGirls.map((user) => {
                if (!user) return null;
                const isOnline = state.onlineUserIds.includes(user.id);
                const isAlready = alreadyDispatched.includes(user.id);
                const isSelected = selectedGirls.includes(user.id);
                return (
                  <button
                    key={user.id}
                    onClick={() => !isAlready && toggleGirl(user.id)}
                    disabled={isAlready}
                    className={`flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-colors ${
                      isSelected
                        ? 'border-purple-400 bg-purple-50'
                        : 'border-transparent bg-brand-snow'
                    } ${isAlready ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <img src={user.avatarUrl} alt={user.nickname} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-ink">{user.nickname}</p>
                      {isAlready ? (
                        <p className="text-xs text-purple-500 font-semibold">已安排</p>
                      ) : (
                        <p className="text-xs text-zinc-400">{isOnline ? '🟢 上線' : '⚪ 離線'}</p>
                      )}
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center shrink-0">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleDispatch}
              disabled={selectedGirls.length === 0}
              className="w-full py-3.5 rounded-2xl bg-purple-500 text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed active:bg-purple-600 transition-colors"
            >
              確認出席{selectedGirls.length > 0 ? `（${selectedGirls.length} 位）` : ''}
            </button>
          </div>
        </div>
      )}

      {/* 編輯女伴名單 sheet */}
      {rosterEditOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setRosterEditOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[430px] bg-white rounded-t-[28px] p-5 pb-8 shadow-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-4 shrink-0" />
            <p className="text-base font-bold text-brand-ink text-center shrink-0">設定我的女伴名單</p>
            <p className="text-xs text-zinc-400 mb-4 text-center shrink-0">
              勾選要納入你旗下的女伴（已選 {rosterDraft.length}）
            </p>

            <div className="flex flex-col gap-2 mb-4 overflow-y-auto">
              {allEscorts.map((user) => {
                const checked = rosterDraft.includes(user.id);
                return (
                  <button
                    key={user.id}
                    onClick={() => toggleRosterDraft(user.id)}
                    className={`flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-colors ${
                      checked ? 'border-purple-400 bg-purple-50' : 'border-transparent bg-brand-snow'
                    }`}
                  >
                    <img src={user.avatarUrl} alt={user.nickname} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-ink">{user.nickname}</p>
                      <p className="text-xs text-zinc-400">{user.defaultArea}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 ${
                      checked ? 'bg-purple-500 border-purple-500' : 'border-zinc-300'
                    }`}>
                      {checked && <Check size={12} className="text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={saveRoster}
              className="shrink-0 w-full py-3.5 rounded-2xl bg-purple-500 text-white text-sm font-bold active:bg-purple-600 transition-colors"
            >
              儲存名單（{rosterDraft.length} 位）
            </button>
          </div>
        </div>
      )}

      {/* 照片管理 sheet（大頭照 + 相簿）*/}
      {photoSheetGirlId && (() => {
        const girl = state.users.find((u) => u.id === photoSheetGirlId);
        if (!girl) return null;
        const hasOverride = state.photoOverrides.some((o) => o.id === girl.id);
        const gallery = galleryOf(girl.id);
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setPhotoSheetGirlId(null)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-[430px] bg-white rounded-t-[28px] p-5 pb-8 shadow-2xl max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-4 shrink-0" />
              <p className="text-base font-bold text-brand-ink text-center shrink-0">
                {girl.nickname} 的照片
              </p>

              <div className="overflow-y-auto mt-4 flex flex-col gap-5">
                {/* 大頭照 */}
                <div>
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">大頭照</p>
                  <div className="flex items-center gap-3">
                    <img src={girl.avatarUrl} alt={girl.nickname} className="w-16 h-16 rounded-2xl object-cover shrink-0" />
                    <div className="flex flex-col gap-2 flex-1">
                      <button
                        onClick={pickAvatar}
                        disabled={uploading}
                        className="w-full py-2.5 rounded-xl bg-brand-sky text-white text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-60"
                      >
                        {uploading && uploadModeRef.current === 'avatar' ? '上傳中…' : '更換大頭照'}
                      </button>
                      {hasOverride && (
                        <button
                          onClick={() => handleResetPhoto(girl.id)}
                          className="w-full py-2 rounded-xl border border-brand-lavender text-xs font-semibold text-zinc-500 active:bg-brand-snow"
                        >
                          還原原始大頭照
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 相簿 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">相簿（{gallery.length}）</p>
                    <button
                      onClick={pickGallery}
                      disabled={uploading}
                      className="text-xs font-bold text-brand-sky active:opacity-70 disabled:opacity-60"
                    >
                      {uploading && uploadModeRef.current === 'gallery' ? '上傳中…' : '＋ 新增照片'}
                    </button>
                  </div>
                  {gallery.length === 0 ? (
                    <p className="text-xs text-zinc-400 py-4 text-center">尚無相簿照片，點「新增照片」上傳</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {gallery.map((url) => (
                        <div key={url} className="relative aspect-square">
                          <img src={url} alt="" className="w-full h-full rounded-xl object-cover" />
                          <button
                            onClick={() => removeGalleryPhoto(girl.id, url)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow ring-2 ring-white active:scale-90"
                            aria-label="刪除這張照片"
                          >
                            <X size={11} strokeWidth={3} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => setPhotoSheetGirlId(null)}
                className="shrink-0 mt-5 w-full py-3 rounded-2xl border border-brand-lavender text-sm font-semibold text-zinc-500 active:bg-brand-snow"
              >
                完成
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
