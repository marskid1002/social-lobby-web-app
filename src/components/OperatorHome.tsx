'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { refreshShared, useAppState } from '@/lib/state';
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { X, Check, UserCog, Camera, Trash2, Pencil } from 'lucide-react';
import { RequestHeartSlots } from '@/components/RequestHeartSlots';
import { AREA_CITIES, AREA_OPTIONS, cityForArea, type AreaCity } from '@/lib/area-options';
import { getRequestTypeLabel, SHOW_REQUEST_CLASSIFICATION } from '@/lib/utils';
import {
  activeConfirmedGirlIds,
  confirmedCountForRequest,
} from '@/lib/request-attendance';


const TYPE_COLORS: Record<string, string> = {
  after_party: '#FF3C91',
  drinking: '#F59E0B',
  fill_spot: '#6C2EFF',
  last_minute: '#EF4444',
  music: '#8BD8F1',
  dancing: '#6C2EFF',
  private_party: '#FF3C91',
  dining: '#A8E6CF',
  other: '#9295A5',
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
  const { state, dispatchGirl, switchToRosterGirl, setUserPresence, setPhotoOverride, resetPhotoOverride, updateUser, addEscort, updateEscortProfile, removeEscort } = useAppState();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const uploadModeRef = useRef<'avatar' | 'gallery'>('avatar');
  const [photoSheetGirlId, setPhotoSheetGirlId] = useState<string | null>(null); // 開啟照片管理彈窗的小姐
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  const galleryOf = (userId: string) => state.photoGalleries.find((g) => g.id === userId)?.urls ?? [];

  function pickAvatar() {
    uploadModeRef.current = 'avatar';
    if (!photoInputRef.current) return;
    photoInputRef.current.multiple = false;
    photoInputRef.current.click();
  }

  function pickGallery() {
    uploadModeRef.current = 'gallery';
    if (!photoInputRef.current) return;
    photoInputRef.current.multiple = true;
    photoInputRef.current.click();
  }

  // 失敗時 throw 帶原因的錯誤（HTTP 狀態、伺服器訊息、是否縮圖成功、約略大小），方便診斷
  async function uploadImage(girlId: string, file: File): Promise<string> {
    // 先縮圖轉 JPEG（相容手機大圖 / HEIC）；縮圖失敗才退回原始檔
    let dataUrl: string;
    let downscaled = true;
    try {
      dataUrl = await downscaleToJpegDataUrl(file);
    } catch {
      downscaled = false;
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });
    }
    const approxKb = Math.round((dataUrl.length * 3) / 4 / 1024); // base64 → 位元組估算
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: girlId,
        dataUrl,
        kind: uploadModeRef.current === 'gallery' ? 'gallery' : 'managed-photo',
      }),
    });
    if (!res.ok) {
      let detail = String(res.status);
      try { const j = await res.json(); if (j?.error) detail += ` ${j.error}`; } catch {}
      throw new Error(`上傳失敗(${detail})${downscaled ? '' : '·縮圖失敗用原檔'}·約${approxKb}KB`);
    }
    const data = await res.json();
    if (!data?.url) throw new Error('上傳失敗：伺服器未回傳網址');
    return data.url as string;
  }

  async function saveGalleryChanges(girlId: string, changes: { append?: string[]; remove?: string[] }) {
    const res = await fetch('/api/gallery', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ escortId: girlId, append: changes.append ?? [], remove: changes.remove ?? [] }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (data.error === 'escort ownership not found') {
        throw new Error('小姐所屬資料尚未同步完成，請重新整理後再試');
      }
      throw new Error(`相簿儲存失敗（${res.status}）`);
    }
    await refreshShared();
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files ?? []);
    const girlId = photoSheetGirlId;
    const mode = uploadModeRef.current;
    e.target.value = ''; // 允許重選同一檔
    if (selectedFiles.length === 0 || !girlId) return;
    const files = mode === 'avatar' ? selectedFiles.slice(0, 1) : selectedFiles;
    setUploading(true);
    try {
      if (mode === 'avatar') {
        setUploadProgress({ current: 1, total: 1 });
        const url = await uploadImage(girlId, files[0]);
        setPhotoOverride(girlId, url);
        setToast('✅ 已更新大頭照');
      } else {
        const uploadedUrls: string[] = [];
        const errors: string[] = [];
        for (const [index, file] of files.entries()) {
          setUploadProgress({ current: index + 1, total: files.length });
          try {
            const url = await uploadImage(girlId, file);
            uploadedUrls.push(url);
          } catch (err) {
            errors.push(`${file.name}：${err instanceof Error ? err.message : '上傳失敗'}`);
          }
        }
        if (uploadedUrls.length === 0) throw new Error(errors[0] ?? '照片上傳失敗');
        await saveGalleryChanges(girlId, { append: uploadedUrls });
        setToast(
          errors.length === 0
            ? `✅ 已加入 ${uploadedUrls.length} 張照片`
            : `⚠️ 已加入 ${uploadedUrls.length} 張，${errors.length} 張失敗`,
        );
      }
      setTimeout(() => setToast(''), 2500);
    } catch (err) {
      // 顯示真正原因，且停留久一點方便回報
      setToast(`⚠️ ${err instanceof Error ? err.message : '上傳失敗'}`);
      setTimeout(() => setToast(''), 8000);
    } finally {
      setUploadProgress(null);
      setUploading(false);
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
  const [nameDraft, setNameDraft] = useState(''); // 首登設定顯示名稱
  const [addOpen, setAddOpen] = useState(false); // 新增人員彈窗
  const [newEscortName, setNewEscortName] = useState('');
  const [editEscortId, setEditEscortId] = useState<string | null>(null);
  const [editEscortName, setEditEscortName] = useState('');
  const [editEscortBio, setEditEscortBio] = useState('');
  const [editEscortCity, setEditEscortCity] = useState<AreaCity>('台北市');
  const [editEscortArea, setEditEscortArea] = useState('信義區');

  // 幹部自建的小姐（B）：名單以 managerId === 本人 動態產生（一開始為空，全部由幹部自建）
  const rosterGirls = state.users.filter((u) => u.role === 'escort' && u.managerId === state.currentUserId);
  const removedRosterGirls = state.escorts
    .filter((escort) => escort.managerId === state.currentUserId && escort.removed === true)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const currentRosterIds = rosterGirls.map((u) => u.id);
  const busyGirlIds = activeConfirmedGirlIds(state.responses, state.invitations);

  function handleAddEscort() {
    const name = newEscortName.trim();
    if (!name) return;
    addEscort(name);
    setNewEscortName('');
    setAddOpen(false);
    setToast('✅ 已新增人員');
    setTimeout(() => setToast(''), 2500);
  }

  async function handleRemoveGalleryPhoto(girlId: string, url: string) {
    if (uploading) return;
    setUploading(true);
    try {
      await saveGalleryChanges(girlId, { remove: [url] });
      setToast('已刪除相簿照片');
      setTimeout(() => setToast(''), 2500);
    } catch (err) {
      setToast(`⚠️ ${err instanceof Error ? err.message : '刪除失敗'}`);
      setTimeout(() => setToast(''), 5000);
    } finally {
      setUploading(false);
    }
  }

  function openEscortEditor(user: (typeof rosterGirls)[number]) {
    const city = cityForArea(user.defaultArea);
    setEditEscortId(user.id);
    setEditEscortName(user.nickname);
    setEditEscortBio(user.bio ?? '');
    setEditEscortCity(city);
    setEditEscortArea(user.defaultArea);
  }

  function handleEditEscortCity(nextCity: AreaCity) {
    setEditEscortCity(nextCity);
    setEditEscortArea(AREA_OPTIONS[nextCity][0]);
  }

  function handleSaveEscort() {
    if (!editEscortId) return;
    const ok = updateEscortProfile(editEscortId, {
      nickname: editEscortName,
      bio: editEscortBio,
      defaultArea: editEscortArea,
    });
    if (!ok) return;
    setEditEscortId(null);
    setToast('✅ 已更新人員資料');
    setTimeout(() => setToast(''), 2500);
  }

  // 新進活動邀請：所有 open 狀態、由 VIP/一般用戶或任一幹部（含自己）發的局
  const incomingRequests = state.requests
    .filter((r) => {
      if (r.status !== 'open') return false;
      if (new Date(r.expiresAt).getTime() <= Date.now()) return false;
      if (confirmedCountForRequest(r.id, state.responses, state.invitations) >= r.peopleCount) {
        return false;
      }
      const creator = state.users.find((u) => u.id === r.creatorId);
      if (!creator) return false;
      return creator.role === 'user' || creator.role === 'manager';
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());


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
  const eligibleSelectedCount = selectedGirls.filter(
    (girlId) => !busyGirlIds.has(girlId) && state.onlineUserIds.includes(girlId),
  ).length;

  function toggleGirl(girlId: string) {
    if (busyGirlIds.has(girlId) || !state.onlineUserIds.includes(girlId)) return;
    setSelectedGirls((prev) =>
      prev.includes(girlId) ? prev.filter((id) => id !== girlId) : [...prev, girlId]
    );
  }

  function handleDispatch() {
    const eligibleGirls = selectedGirls.filter(
      (girlId) => !busyGirlIds.has(girlId) && state.onlineUserIds.includes(girlId),
    );
    if (!dispatchSheet || eligibleGirls.length === 0) return;
    const names = eligibleGirls
      .map((id) => state.users.find((u) => u.id === id)?.nickname)
      .filter(Boolean)
      .join('、');
    eligibleGirls.forEach((girlId) => dispatchGirl(dispatchSheet, girlId));
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
            const confirmedCount = confirmedCountForRequest(req.id, state.responses, state.invitations);
            const isFull = isRequestClosed(req); // #5 只有已關閉才鎖定
            const typeColor = TYPE_COLORS[req.requestType] ?? '#9295A5';
            const typeLabel = getRequestTypeLabel(req);

            return (
              <div key={req.id} className={`juga-request-card bg-white rounded-2xl border border-brand-lavender p-4 shadow-sm transition-opacity ${isFull ? 'opacity-60' : ''}`}>
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
                  {SHOW_REQUEST_CLASSIFICATION && <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-brand-ink"
                    style={{ backgroundColor: typeColor }}
                  >
                    {typeLabel}
                  </span>}
                  <span className="text-xs text-zinc-500">{req.area} · {req.peopleCount} 人</span>
                </div>

                <p className="text-sm text-zinc-700 line-clamp-2 mb-3">{req.note}</p>

                <RequestHeartSlots
                  total={req.peopleCount}
                  confirmed={confirmedCount}
                  className="mb-3"
                />

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
          onClick={() => { setNewEscortName(''); setAddOpen(true); }}
          className="shrink-0 text-[11px] font-bold text-purple-600 bg-purple-50 border border-purple-200 px-2.5 py-1.5 rounded-full active:bg-purple-100 transition-colors"
        >
          ＋ 新增人員
        </button>
      </div>

      {rosterGirls.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-zinc-400">目前沒有人員，請自行新增</p>
          <button onClick={() => { setNewEscortName(''); setAddOpen(true); }} className="mt-2 text-xs font-bold text-purple-600 underline">＋ 新增人員</button>
        </div>
      ) : (
        <div>
          {rosterGirls.map((user) => {
            if (!user) return null;
            const isOnline = state.onlineUserIds.includes(user.id);
            const isBusy = busyGirlIds.has(user.id);
            const galleryCount = galleryOf(user.id).length;
            return (
              <div key={user.id} className="flex items-center gap-2 px-4 py-3 bg-white border-b border-zinc-100">
                <div className="relative shrink-0">
                  <img src={user.avatarUrl} alt={user.nickname} className="w-10 h-10 rounded-full object-cover" />
                  <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${isBusy ? 'bg-pink-500' : isOnline ? 'bg-green-400' : 'bg-zinc-300'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-brand-ink truncate">{user.nickname}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {isBusy ? <span className="font-semibold text-pink-500">約會中，忙碌</span> : isOnline ? '🟢 上線中' : '⚪ 離線'}
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
                  onClick={() => openEscortEditor(user)}
                  className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full border border-purple-200 bg-purple-50 text-purple-600 active:bg-purple-100"
                  aria-label={`編輯 ${user.nickname} 的資料`}
                  title="編輯資料"
                >
                  <Pencil size={13} />
                </button>
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
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    if (window.confirm(`確定刪除人員「${user.nickname}」？歷史紀錄仍會保留。`)) {
                      removeEscort(user.id);
                      setToast('已刪除人員');
                      setTimeout(() => setToast(''), 2500);
                    }
                  }}
                  className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-500 active:bg-red-100 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={`刪除 ${user.nickname}`}
                  title={isBusy ? '約會中不可刪除' : '刪除人員'}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {removedRosterGirls.length > 0 && (
        <div className="border-t-8 border-zinc-100">
          <div className="flex items-center justify-between bg-zinc-50 px-4 py-3">
            <p className="text-xs font-bold text-zinc-500">已刪除（{removedRosterGirls.length}）</p>
            <span className="text-[11px] text-zinc-400">僅保留紀錄，無法恢復</span>
          </div>
          {removedRosterGirls.map((escort) => (
            <div key={escort.id} className="flex items-center gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-3 opacity-75">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-bold text-zinc-500" aria-hidden="true">
                {escort.nickname.slice(0, 1) || '－'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-600">{escort.nickname}</p>
                <p className="mt-0.5 text-xs text-zinc-400">已永久刪除</p>
              </div>
              <span className="shrink-0 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-bold text-zinc-400">
                已刪除
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 隱藏檔案輸入（編輯照片用）*/}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePhotoChange}
      />

      {/* Toast */}
      {toast && (
        <div className="app-toast-layer fixed bottom-28 left-1/2 -translate-x-1/2 bg-brand-ink text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-lg max-w-[90vw] text-center break-words">
          {toast}
        </div>
      )}

      {/* Dispatch bottom sheet */}
      {dispatchSheet && (
        <div className="app-modal-layer fixed inset-0 flex items-end justify-center" onClick={() => setDispatchSheet(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="app-bottom-sheet relative w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl"
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
                const isBusy = busyGirlIds.has(user.id);
                const isSelected = selectedGirls.includes(user.id);
                return (
                  <button
                    key={user.id}
                    onClick={() => !isAlready && !isBusy && isOnline && toggleGirl(user.id)}
                    disabled={isAlready || isBusy || !isOnline}
                    className={`flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-colors ${
                      isSelected
                        ? 'border-purple-400 bg-purple-50'
                        : 'border-transparent bg-brand-snow'
                    } ${isAlready || isBusy || !isOnline ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <img src={user.avatarUrl} alt={user.nickname} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-ink">{user.nickname}</p>
                      {isBusy ? (
                        <p className="text-xs text-pink-500 font-semibold">已確認上台</p>
                      ) : isAlready ? (
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
              disabled={eligibleSelectedCount === 0}
              className="sticky bottom-0 z-10 w-full py-3.5 rounded-2xl bg-purple-500 text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed active:bg-purple-600 transition-colors"
            >
              確認出席{selectedGirls.length > 0 ? `（${selectedGirls.length} 位）` : ''}
            </button>
          </div>
        </div>
      )}

      {/* 新增人員 sheet（幹部自建小姐）*/}
      {editEscortId && (
        <div className="app-modal-layer fixed inset-0 flex items-end justify-center" onClick={() => setEditEscortId(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="app-bottom-sheet relative w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-brand-ink">編輯人員資料</h2>
              <button onClick={() => setEditEscortId(null)} className="rounded-full p-1.5 text-zinc-400" aria-label="關閉">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <div>
                <label className="text-sm font-semibold text-brand-ink" htmlFor="escort-name">名稱</label>
                <input
                  id="escort-name"
                  value={editEscortName}
                  onChange={(e) => setEditEscortName(e.target.value)}
                  maxLength={20}
                  className="mt-1.5 w-full rounded-xl border border-brand-lavender bg-brand-snow px-4 py-3 text-sm text-brand-ink focus:outline-none focus:border-brand-sky"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-brand-ink" htmlFor="escort-bio">自我介紹</label>
                  <span className="text-xs text-zinc-400">{editEscortBio.length}/100</span>
                </div>
                <textarea
                  id="escort-bio"
                  value={editEscortBio}
                  onChange={(e) => setEditEscortBio(e.target.value)}
                  rows={4}
                  maxLength={100}
                  placeholder="簡短介紹自己…"
                  className="mt-1.5 w-full resize-none rounded-xl border border-brand-lavender bg-brand-snow px-4 py-3 text-sm text-brand-ink focus:outline-none focus:border-brand-sky"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-brand-ink">所在區域</label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <select
                    value={editEscortCity}
                    onChange={(e) => handleEditEscortCity(e.target.value as AreaCity)}
                    className="rounded-xl border border-brand-lavender bg-white px-3 py-3 text-sm text-brand-ink"
                    aria-label="縣市"
                  >
                    {AREA_CITIES.map((city) => <option key={city} value={city}>{city}</option>)}
                  </select>
                  <select
                    value={editEscortArea}
                    onChange={(e) => setEditEscortArea(e.target.value)}
                    className="rounded-xl border border-brand-lavender bg-white px-3 py-3 text-sm text-brand-ink"
                    aria-label="行政區"
                  >
                    {(AREA_OPTIONS[editEscortCity] as readonly string[]).map((area) => <option key={area} value={area}>{area}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveEscort}
              disabled={!editEscortName.trim() || !editEscortArea}
              className="mt-5 w-full rounded-2xl bg-purple-500 py-3.5 text-sm font-bold text-white disabled:opacity-40"
            >
              儲存資料
            </button>
          </div>
        </div>
      )}

      {addOpen && (
        <div className="app-modal-layer fixed inset-0 flex items-end justify-center" onClick={() => setAddOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="app-bottom-sheet relative w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-4" />
            <p className="text-base font-bold text-brand-ink text-center mb-1">新增人員</p>
            <p className="text-xs text-zinc-400 text-center mb-4">先輸入名稱建立；建立後在列表按「照片」上傳大頭照 / 相簿。</p>
            <input
              value={newEscortName}
              onChange={(e) => setNewEscortName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddEscort(); }}
              placeholder="輸入人員名稱（例如 小美）"
              maxLength={20}
              className="w-full rounded-xl border border-brand-lavender bg-brand-snow px-4 py-3 text-sm text-brand-ink focus:outline-none focus:border-brand-sky mb-4"
              aria-label="人員名稱"
              autoFocus
            />
            <button
              onClick={handleAddEscort}
              disabled={!newEscortName.trim()}
              className="w-full py-3.5 rounded-2xl bg-purple-500 text-white text-sm font-bold disabled:opacity-40 active:bg-purple-600 transition-colors"
            >
              建立
            </button>
            <button onClick={() => setAddOpen(false)} className="w-full mt-2 py-3 rounded-2xl border border-brand-lavender text-zinc-500 font-semibold text-sm">取消</button>
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
          <div className="app-modal-layer fixed inset-0 flex items-end justify-center" onClick={() => setPhotoSheetGirlId(null)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
              className="app-bottom-sheet relative flex w-full max-w-[430px] flex-col rounded-t-[28px] bg-white p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-4 shrink-0" />
              <p className="text-base font-bold text-brand-ink text-center shrink-0">
                {girl.nickname} 的照片
              </p>

              <div className="min-h-0 overflow-y-auto overscroll-contain mt-4 flex flex-col gap-5">
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
                      {uploading && uploadModeRef.current === 'gallery'
                        ? `上傳中 ${uploadProgress?.current ?? 1}/${uploadProgress?.total ?? 1}`
                        : '＋ 新增照片（可多選）'}
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
                            onClick={() => void handleRemoveGalleryPhoto(girl.id, url)}
                            disabled={uploading}
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
