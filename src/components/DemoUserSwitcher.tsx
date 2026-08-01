'use client';

import { useAppState } from '@/lib/state';
import { useRouter } from 'next/navigation';

interface Props {
  open: boolean;
  onClose: () => void;
}

// ── 目前 demo 展示的身份（僅 VIP 用戶 + 幹部）──────────────────────────────
const PERSONAS = [
  {
    userId: 'u-017',
    label: 'VIP 用戶',
    sublabel: '完整功能・可直接開啟對話',
    badgeColor: 'bg-amber-100 text-amber-600 border border-amber-200',
    badgeLabel: 'VIP',
  },
  {
    userId: 'u-018',
    label: '經紀人 / 幹部',
    sublabel: '管理旗下女伴・接單・安排出席',
    badgeColor: 'bg-purple-100 text-purple-600 border border-purple-200',
    badgeLabel: '幹部',
  },
];

// ── 保留但暫時隱藏的身份（未來可放回 PERSONAS）────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _HIDDEN_PERSONAS = [
  {
    userId: 'u-001',
    label: '基本用戶',
    sublabel: '免費・無法進入社群廣場',
    badgeColor: 'bg-zinc-100 text-zinc-500 border border-zinc-200',
    badgeLabel: '基本',
  },
  {
    userId: 'u-019',
    label: '標準用戶',
    sublabel: '可進廣場・可瀏覽 3 位在線用戶',
    badgeColor: 'bg-blue-100 text-blue-600 border border-blue-200',
    badgeLabel: '標準',
  },
  {
    userId: 'u-020',
    label: '進階用戶',
    sublabel: '可在廣場發文・可瀏覽 10 位在線用戶',
    badgeColor: 'bg-violet-100 text-violet-600 border border-violet-200',
    badgeLabel: '進階',
  },
  {
    userId: 'u-002',
    label: '獨立女伴',
    sublabel: '瀏覽可加入的局・直接加入・確認見面',
    badgeColor: 'bg-pink-100 text-pink-600 border border-pink-200',
    badgeLabel: '女伴',
  },
];

export function DemoUserSwitcher({ open, onClose }: Props) {
  const { state, switchUser, setSecondaryUser } = useAppState();
  const router = useRouter();

  // 冒充/切換身份僅限示範模式，正式環境完全停用
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return null;
  if (!open) return null;

  function handleSwitch(userId: string) {
    switchUser(userId);
    onClose();
    router.refresh();
  }

  function handleSetSecondary(userId: string) {
    if (userId === state.currentUserId) return;
    setSecondaryUser(state.secondaryUserId === userId ? null : userId);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="app-bottom-sheet relative w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-brand-lavender rounded-full mx-auto mb-4" />
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3 text-center">
          切換示範用戶
        </p>
        <div className="flex flex-col gap-3">
          {PERSONAS.map((persona) => {
            const user = state.users.find((u) => u.id === persona.userId);
            const isActive = state.currentUserId === persona.userId;
            const isSecondary = state.secondaryUserId === persona.userId;
            return (
              <div
                key={persona.userId}
                className={`flex items-center gap-3 p-4 rounded-2xl transition-colors ${
                  isActive
                    ? 'bg-brand-sky/10 border-2 border-brand-sky'
                    : isSecondary
                    ? 'bg-brand-pink/10 border-2 border-brand-pink'
                    : 'bg-brand-snow border-2 border-transparent'
                }`}
              >
                <button
                  onClick={() => handleSwitch(persona.userId)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-70 transition-opacity"
                >
                  {user && (
                    <img
                      src={user.avatarUrl}
                      alt={user.nickname}
                      className="w-11 h-11 rounded-full object-cover shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-bold text-brand-ink">{persona.label}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${persona.badgeColor}`}>
                        {persona.badgeLabel}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">{persona.sublabel}</p>
                  </div>
                  {isActive && (
                    <span className="text-xs font-bold text-brand-sky shrink-0">使用中</span>
                  )}
                </button>

                {/* 設為第二身份 */}
                {!isActive && (
                  <button
                    onClick={() => handleSetSecondary(persona.userId)}
                    className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border transition-colors ${
                      isSecondary
                        ? 'bg-brand-pink/20 border-brand-pink text-brand-pink'
                        : 'bg-zinc-100 border-zinc-200 text-zinc-500 active:bg-zinc-200'
                    }`}
                    aria-label={isSecondary ? '移除第二身份' : '設為第二身份'}
                  >
                    {isSecondary ? '移除' : '第二'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
