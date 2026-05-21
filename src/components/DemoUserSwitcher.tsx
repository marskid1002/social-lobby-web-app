'use client';

import { useAppState } from '@/lib/state';
import { useRouter } from 'next/navigation';

interface Props {
  open: boolean;
  onClose: () => void;
}

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
        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
          {state.users.filter((u) => u.role !== 'admin').map((user) => (
            <button
              key={user.id}
              onClick={() => handleSwitch(user.id)}
              className={`flex items-center gap-3 p-3 rounded-2xl text-left transition-colors ${
                user.id === state.currentUserId
                  ? 'bg-brand-sky/20 border-2 border-brand-sky'
                  : 'bg-brand-snow border-2 border-transparent'
              }`}
            >
              <img
                src={user.avatarUrl}
                alt={user.nickname}
                className="w-10 h-10 rounded-full object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-brand-ink">{user.nickname}</p>
                <p className="text-xs text-zinc-400">{user.id} · {user.defaultArea}</p>
              </div>
              {user.id === state.currentUserId && (
                <span className="text-xs font-semibold text-brand-sky">目前</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
