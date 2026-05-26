'use client';

import { useAppState } from '@/lib/state';
import { useRouter } from 'next/navigation';

interface Props {
  open: boolean;
  onClose: () => void;
}

const PERSONAS = [
  {
    userId: 'u-001',
    label: '基本用戶',
    sublabel: '免費會員・看不到女生資料',
    badgeColor: 'bg-zinc-100 text-zinc-500 border border-zinc-200',
    badgeLabel: 'FREE',
  },
  {
    userId: 'u-017',
    label: 'VIP 用戶',
    sublabel: '高級會員・可瀏覽女生資料',
    badgeColor: 'bg-amber-100 text-amber-600 border border-amber-200',
    badgeLabel: 'VIP',
  },
  {
    userId: 'u-018',
    label: '幹部視角',
    sublabel: '接單・派遣・管理女生',
    badgeColor: 'bg-purple-100 text-purple-600 border border-purple-200',
    badgeLabel: '幹部',
  },
];

export function DemoUserSwitcher({ open, onClose }: Props) {
  const { state, switchUser } = useAppState();
  const router = useRouter();

  if (!open) return null;

  function handleSwitch(userId: string) {
    switchUser(userId);
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[430px] bg-white rounded-t-[28px] p-5 pb-8 shadow-2xl"
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
            return (
              <button
                key={persona.userId}
                onClick={() => handleSwitch(persona.userId)}
                className={`flex items-center gap-3 p-4 rounded-2xl text-left transition-colors ${
                  isActive
                    ? 'bg-brand-sky/10 border-2 border-brand-sky'
                    : 'bg-brand-snow border-2 border-transparent active:bg-brand-lavender/20'
                }`}
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
            );
          })}
        </div>
      </div>
    </div>
  );
}
