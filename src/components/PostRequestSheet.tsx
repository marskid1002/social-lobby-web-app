'use client';

import { useEffect, useState } from 'react';
import { X, Minus, Plus } from 'lucide-react';
import { useAppState } from '@/lib/state';
import type { PartyFormat, Request, RequestType, VenueType } from '@/lib/mock';
import { AREA_CITIES, AREA_OPTIONS, cityForArea, type AreaCity } from '@/lib/area-options';
import { useRouter } from 'next/navigation';

const REQUEST_TYPES: { value: RequestType; label: string; color: string }[] = [
  { value: 'drinking', label: '喝酒', color: '#F59E0B' },
  { value: 'music', label: '音樂', color: '#8BD8F1' },
  { value: 'dancing', label: '跳舞', color: '#6C2EFF' },
  { value: 'private_party', label: '私人派對', color: '#FF3C91' },
  { value: 'dining', label: '吃飯', color: '#A8E6CF' },
];

const VENUE_TYPES: { value: VenueType; label: string }[] = [
  { value: 'nightclub', label: '夜店' },
  { value: 'clubhouse', label: '會所' },
  { value: 'home', label: '住家' },
  { value: 'bar', label: '酒吧' },
  { value: 'motel', label: '汽旅' },
];

const PARTY_FORMATS: { value: PartyFormat; label: string }[] = [
  { value: 'with_women', label: '局有女' },
  { value: 'without_women', label: '局無女' },
  { value: 'one_on_one', label: '1 對 1' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  request?: Request;
  onSaved?: () => void;
}

export function PostRequestSheet({ open, onClose, request, onSaved }: Props) {
  const { currentUser, postRequest, updateRequest } = useAppState();
  const router = useRouter();
  const isEditing = Boolean(request);

  const maxCount = 20; // 發局免費、不分等級：可加入人數 1~20

  const initialArea = currentUser?.defaultArea ?? '信義區';
  const [city, setCity] = useState<AreaCity>(() => cityForArea(initialArea));
  const [area, setArea] = useState(initialArea);
  const [type, setType] = useState<RequestType | null>(null);
  const [venueType, setVenueType] = useState<VenueType | null>(null);
  const [partyFormat, setPartyFormat] = useState<PartyFormat | null>(null);
  const [count, setCount] = useState(Math.min(1, maxCount));
  const [note, setNote] = useState('');
  const [toast, setToast] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nextArea = request?.area ?? currentUser?.defaultArea ?? '信義區';
    setCity(cityForArea(nextArea));
    setArea(nextArea);
    setType(request?.requestType ?? null);
    setVenueType(request?.venueType ?? null);
    setPartyFormat(request?.partyFormat ?? null);
    setCount(request?.peopleCount ?? 1);
    setNote(request?.note ?? '');
  }, [currentUser?.defaultArea, open, request]);

  const districtOptions = AREA_OPTIONS[city] as readonly string[];
  const isLegacyArea = area !== '' && !districtOptions.includes(area);

  function handleCityChange(nextCity: AreaCity) {
    setCity(nextCity);
    setArea(AREA_OPTIONS[nextCity][0]);
  }

  function handleSubmit() {
    if (!type) return;
    if (currentUser?.tier === 'guest') return; // 訪客不可發局（伺服器也會擋）
    if (request) {
      const updated = updateRequest(request.id, {
        area,
        venueType: venueType ?? undefined,
        partyFormat: partyFormat ?? undefined,
        requestType: type,
        peopleCount: count,
        note,
      });
      if (!updated) return;
    } else {
      if (!venueType || !partyFormat) return;
      postRequest({ area, venueType, partyFormat, requestType: type, peopleCount: count, note });
    }
    setToast(true);
    setTimeout(() => {
      setToast(false);
      onClose();
      onSaved?.();
      setType(null);
      setVenueType(null);
      setPartyFormat(null);
      setNote('');
      setCount(Math.min(1, maxCount));
      if (!isEditing) router.push('/inbox');
    }, 1000);
  }

  if (!open) return null;

  // 訪客直接打網址開這頁也不能發局：顯示提示、不給表單（避免假成功）
  if (currentUser?.tier === 'guest') {
    return (
      <div className="app-modal-layer fixed inset-0 flex items-end justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="app-bottom-sheet relative w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-white p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
          <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-4" />
          <p className="text-base font-bold text-brand-ink mb-1">訪客無法發局</p>
          <p className="text-sm text-zinc-400 mb-5">登入或註冊後即可發布邀請。</p>
          <button onClick={onClose} className="w-full py-3 rounded-2xl bg-brand-sky text-brand-ink font-bold text-sm active:scale-95 transition-transform">知道了</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-modal-layer fixed inset-0 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="app-bottom-sheet relative w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-brand-ink">{isEditing ? '編輯邀請' : '發布邀請'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-brand-snow" aria-label="關閉">
            <X className="w-5 h-5 text-zinc-500" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex flex-col gap-5">
            {/* Area */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-brand-ink">區域</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={city}
                  onChange={(e) => handleCityChange(e.target.value as AreaCity)}
                  className="w-full rounded-2xl border border-brand-lavender bg-white px-4 py-3 text-base text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-sky appearance-none"
                  aria-label="縣市"
                >
                  {AREA_CITIES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="w-full rounded-2xl border border-brand-lavender bg-white px-4 py-3 text-base text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-sky appearance-none"
                  aria-label="行政區"
                >
                  {isLegacyArea && <option value={area}>{area}</option>}
                  {districtOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            </div>

            {/* Venue */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-brand-ink">地點</label>
              <div className="flex flex-wrap gap-2">
                {VENUE_TYPES.map((venue) => (
                  <button
                    key={venue.value}
                    type="button"
                    onClick={() => setVenueType(venue.value)}
                    className={`rounded-full border-2 px-4 py-2 text-sm font-medium transition-all active:scale-95 ${
                      venueType === venue.value
                        ? 'border-transparent bg-brand-mint text-brand-ink'
                        : 'border-brand-lavender bg-white text-zinc-500'
                    }`}
                  >
                    {venue.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Type */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-brand-ink">邀約類型</label>
              <div className="flex flex-wrap gap-2">
                {REQUEST_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setType(t.value)}
                    className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-all active:scale-95 ${
                      type === t.value
                        ? 'border-transparent text-brand-ink'
                        : 'border-brand-lavender text-zinc-500 bg-white'
                    }`}
                    style={type === t.value ? { backgroundColor: t.color } : {}}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Party format — required */}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-semibold text-brand-ink">局型</legend>
              <div className="flex flex-wrap gap-4">
                {PARTY_FORMATS.map((format) => {
                  const selected = partyFormat === format.value;
                  return (
                    <button
                      key={format.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPartyFormat(format.value)}
                      className="flex items-center gap-2 py-1 text-sm font-medium text-brand-ink"
                    >
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                        selected ? 'border-blue-500 bg-blue-500' : 'border-zinc-300 bg-white'
                      }`}>
                        {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                      </span>
                      {format.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Count — capped by tier */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-brand-ink">可加入人數</label>
                <span className="text-xs text-zinc-400">最多 {maxCount} 人</span>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setCount((c) => Math.max(1, c - 1))}
                  className="w-10 h-10 rounded-full border-2 border-brand-lavender flex items-center justify-center active:bg-brand-ice transition-colors"
                  aria-label="減少人數"
                >
                  <Minus className="w-4 h-4 text-brand-ink" strokeWidth={2} />
                </button>
                <span className="text-2xl font-semibold text-brand-ink w-8 text-center">{count}</span>
                <button
                  onClick={() => setCount((c) => Math.min(maxCount, c + 1))}
                  className="w-10 h-10 rounded-full border-2 border-brand-lavender flex items-center justify-center active:bg-brand-ice transition-colors"
                  aria-label="增加人數"
                >
                  <Plus className="w-4 h-4 text-brand-ink" strokeWidth={2} />
                </button>
              </div>
            </div>

            {/* Note */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-brand-ink">備註</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                maxLength={200}
                placeholder="說明你想找的人或場合..."
                className="w-full rounded-2xl border border-brand-lavender bg-white px-4 py-3 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-sky resize-none"
              />
              <p className="text-xs text-zinc-400 text-right">{note.length}/200</p>
            </div>

            <p className="text-xs text-zinc-400 text-center">
              {isEditing ? '原本的有效期限不會因編輯而延長' : '邀請有效時間：2 小時'}
            </p>

            {/* Submit */}
            <div className="app-sticky-sheet-action">
              <button
                onClick={handleSubmit}
                disabled={!type || !venueType || !partyFormat}
                className="w-full rounded-2xl bg-brand-sky text-brand-ink font-semibold text-base py-4 active:scale-[0.98] transition-all disabled:opacity-40 shadow-card"
              >
              {isEditing ? '儲存變更' : '發送邀請'}
              </button>
            </div>
          </div>
      </div>

      {toast && (
        <div className="app-toast-layer absolute bottom-12 left-1/2 -translate-x-1/2 bg-brand-ink text-white text-sm rounded-full px-5 py-2.5 shadow-lg">
          {isEditing ? '邀請已更新' : '邀請已發送'}
        </div>
      )}
    </div>
  );
}
